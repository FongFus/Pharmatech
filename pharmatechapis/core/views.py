from rest_framework import viewsets, generics, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count
from django.shortcuts import get_object_or_404
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import User, Product, Cart, CartItem, Order, OrderItem, Payment, ChatMessage, DeviceToken
from .serializers import (
    UserSerializer, UserDetailSerializer, ProductSerializer, CartSerializer,
    CartItemSerializer, OrderSerializer, OrderItemSerializer, PaymentSerializer,
    ChatMessageSerializer, DeviceTokenSerializer, AdminProductApprovalSerializer
)
from .permissions import (
    IsCustomer, IsDistributor, IsAdmin, IsCartOwner, IsOrderOwner, IsProductOwner, IsChatMessageSender
)
from .paginators import ItemPaginator
from .utils import send_fcm_v1, save_message_to_firebase
from .authentication import CustomOAuth2Authentication
from django.http import JsonResponse, HttpResponse
import uuid
import hashlib
import hmac
from urllib.parse import quote_plus
from datetime import datetime
import pytz
from django.test import RequestFactory
from .ai_utils import call_gemini_api
import pyrebase

firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
db = firebase.database()

# Save FCM token
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def save_fcm_token(request):
    token = request.data.get('token')
    device_type = request.data.get('device_type', 'android')
    if not token:
        return Response({'error': 'Thiếu token thiết bị.'}, status=status.HTTP_400_BAD_REQUEST)
    
    DeviceToken.objects.update_or_create(
        user=request.user,
        token=token,
        defaults={'device_type': device_type, 'updated_at': timezone.now()}
    )
    
    send_fcm_v1(
        request.user,
        title="Chào mừng bạn!",
        body="Đăng nhập thành công. Bạn sẽ nhận thông báo từ hệ thống.",
        data={"type": "welcome"}
    )
    return Response({'message': 'Token thiết bị đã được lưu.'}, status=status.HTTP_200_OK)

# Ping view to keep server alive
@api_view(['GET'])
def ping_view(request):
    return JsonResponse({"status": "alive"})

# VNPay payment URL
@api_view(['GET'])
def create_payment_url(request):
    tz = pytz.timezone("Asia/Ho_Chi_Minh")
    vnp_TmnCode = settings.VNPAY_TMN_CODE
    vnp_HashSecret = settings.VNPAY_HASH_SECRET
    vnp_Url = settings.VNPAY_URL
    vnp_ReturnUrl = settings.VNPAY_RETURN_URL

    amount = request.GET.get("amount", "10000")
    order_type = "pharmacy_order"
    order_id = datetime.now(tz).strftime('%Y%m%d%H%M%S')
    create_date = datetime.now(tz).strftime('%Y%m%d%H%M%S')
    ip_address = request.META.get('REMOTE_ADDR', '127.0.0.1')

    input_data = {
        "vnp_Version": "2.1.0",
        "vnp_Command": "pay",
        "vnp_TmnCode": vnp_TmnCode,
        "vnp_Amount": str(int(float(amount)) * 100),
        "vnp_CurrCode": "VND",
        "vnp_TxnRef": order_id,
        "vnp_OrderInfo": "Thanh toan don hang dược phẩm",
        "vnp_OrderType": order_type,
        "vnp_Locale": "vn",
        "vnp_ReturnUrl": vnp_ReturnUrl,
        "vnp_IpAddr": ip_address,
        "vnp_CreateDate": create_date
    }

    sorted_data = sorted(input_data.items())
    query_string = '&'.join(f"{k}={quote_plus(str(v))}" for k, v in sorted_data if v)
    hash_data = '&'.join(f"{k}={quote_plus(str(v))}" for k, v in sorted_data if v and k != "vnp_SecureHash")
    
    secure_hash = hmac.new(
        bytes(vnp_HashSecret, 'utf-8'),
        bytes(hash_data, 'utf-8'),
        hashlib.sha512
    ).hexdigest()
    
    payment_url = f"{vnp_Url}?{query_string}&vnp_SecureHash={secure_hash}"
    return JsonResponse({"payment_url": payment_url})

# VNPay redirect callback
@api_view(['GET'])
def vnpay_redirect(request):
    vnp_HashSecret = settings.VNPAY_HASH_SECRET
    input_data = request.GET.dict()
    vnp_SecureHash = input_data.get('vnp_SecureHash')
    input_data.pop('vnp_SecureHash', None)

    sorted_data = sorted(input_data.items())
    hash_data = '&'.join(f"{k}={quote_plus(str(v))}" for k, v in sorted_data if v)
    secure_hash = hmac.new(
        bytes(vnp_HashSecret, 'utf-8'),
        bytes(hash_data, 'utf-8'),
        hashlib.sha512
    ).hexdigest()

    if secure_hash != vnp_SecureHash:
        return JsonResponse({"error": "Invalid secure hash"}, status=400)

    transaction_id = input_data.get('vnp_TxnRef')
    response_code = input_data.get('vnp_ResponseCode')
    
    try:
        payment = Payment.objects.get(transaction_id=transaction_id)
    except Payment.DoesNotExist:
        return JsonResponse({"error": "Payment not found"}, status=404)

    if response_code == '00':  # Transaction successful
        payment.status = True
        payment.paid_at = timezone.now()
        payment.save()

        order = payment.order
        order.status = 'completed'
        order.save()

        send_fcm_v1(
            payment.user,
            title="Thanh toán thành công",
            body=f"Thanh toán cho đơn hàng {order.order_code} đã hoàn tất.",
            data={"order_id": str(order.id)}
        )
        send_mail(
            subject=f"Thanh toán thành công cho đơn hàng {order.order_code}",
            message=f"Kính gửi {payment.user.username},\n\nThanh toán cho đơn hàng {order.order_code} đã được xác nhận.\n\nTrân trọng!",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[payment.user.email],
            fail_silently=False,
        )
        return JsonResponse({"message": "Thanh toán thành công", "order_id": order.id})
    else:
        return JsonResponse({"error": "Thanh toán thất bại", "response_code": response_code}, status=400)

# User ViewSet
class UserViewSet(viewsets.ViewSet, generics.CreateAPIView, generics.ListAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = User.objects.all()
    serializer_class = UserSerializer
    pagination_class = ItemPaginator
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['username', 'email', 'full_name', 'phone']
    ordering_fields = ['created_at', 'username']

    def get_permissions(self):
        if self.action in ['list', 'admin_change_user_active_state']:
            return [IsAdmin()]
        elif self.action in ['get_current_user', 'deactivate']:
            return [permissions.IsAuthenticated()]
        elif self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(methods=['get', 'patch'], detail=False, url_path='current-user')
    def get_current_user(self, request):
        user = request.user
        if request.method == 'PATCH':
            serializer = self.get_serializer(user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(self.get_serializer(user).data)
        else:
            serializer = UserDetailSerializer(user)
            return Response(serializer.data)

    @action(methods=['post'], detail=False, url_path='deactivate')
    def deactivate(self, request):
        user = request.user
        user.is_active = False
        user.save()
        return Response({"detail": "Tài khoản đã bị vô hiệu hóa."}, status=status.HTTP_200_OK)

    @action(methods=['post'], detail=False, url_path='change-user-active-state')
    def admin_change_user_active_state(self, request):
        user_id = request.data.get('user_id')
        is_active = request.data.get('is_active')
        if user_id is None or is_active is None:
            return Response({"error": "Thiếu user_id hoặc is_active."}, status=status.HTTP_400_BAD_REQUEST)
        
        user = get_object_or_404(User, pk=user_id)
        user.is_active = bool(is_active)
        user.save()
        action = "kích hoạt" if user.is_active else "vô hiệu hóa"
        return Response(
            {"detail": f"Tài khoản {user.username} đã được {action} bởi admin."},
            status=status.HTTP_200_OK
        )

# Product ViewSet
class ProductViewSet(viewsets.ViewSet, generics.ListAPIView, generics.CreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Product.objects.filter(is_approved=True)
    serializer_class = ProductSerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_approved']
    search_fields = ['name', 'description', 'category']
    ordering_fields = ['price', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        elif self.action in ['create', 'my_products']:
            return [IsDistributor()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsDistributor(), IsProductOwner()]
        elif self.action == 'approve_product':
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(methods=['get'], detail=False, url_path='my-products')
    def my_products(self, request):
        products = Product.objects.filter(distributor=request.user)
        page = self.paginate_queryset(products)
        serializer = self.get_serializer(page or products, many=True)
        return self.get_paginated_response(serializer.data) if page else Response(serializer.data)

    @action(methods=['post'], detail=True, url_path='approve')
    def approve_product(self, request, pk):
        product = self.get_object()
        serializer = AdminProductApprovalSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if product.is_approved:
            send_fcm_v1(
                product.distributor,
                title="Sản phẩm được duyệt",
                body=f"Sản phẩm {product.name} đã được duyệt.",
                data={"product_id": str(product.id)}
            )
            send_mail(
                subject="Sản phẩm được duyệt",
                message=f"Sản phẩm {product.name} đã được duyệt và sẵn sàng bán.",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[product.distributor.email],
                fail_silently=False,
            )
        return Response({"message": "Trạng thái sản phẩm đã được cập nhật."}, status=status.HTTP_200_OK)

    @action(methods=['get'], detail=False, url_path='statistics')
    def get_statistics(self, request):
        if request.user.role != 'distributor':
            return Response({"error": "Chỉ nhà phân phối mới có quyền xem thống kê."}, status=status.HTTP_403_FORBIDDEN)
        
        products = Product.objects.filter(distributor=request.user)
        total_revenue = OrderItem.objects.filter(product__in=products).aggregate(total=Sum('price'))['total'] or 0
        top_products = products.annotate(sold=Count('orderitem')).order_by('-sold')[:5]
        
        return Response({
            'total_revenue': str(total_revenue),
            'top_products': ProductSerializer(top_products, many=True).data
        })

# Cart ViewSet
class CartViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Cart.objects.all()
    serializer_class = CartSerializer
    permission_classes = [IsCustomer, IsCartOwner]
    pagination_class = ItemPaginator

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    @action(methods=['post'], detail=True, url_path='add-item')
    def add_item(self, request, pk):
        cart = self.get_object()
        serializer = CartItemSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(cart=cart)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

# Order ViewSet
class OrderViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [IsCustomer, IsOrderOwner]
    pagination_class = ItemPaginator

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        cart_id = request.data.get('cart_id')
        cart = get_object_or_404(Cart, id=cart_id, user=request.user)
        items = cart.items.all()
        if not items:
            return Response({"error": "Giỏ hàng trống."}, status=status.HTTP_400_BAD_REQUEST)

        total_amount = sum(item.quantity * item.product.price for item in items)
        order_code = f"ORDER-{uuid.uuid4().hex[:8].upper()}"
        order = Order.objects.create(user=request.user, order_code=order_code, total_amount=total_amount)

        for item in items:
            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                price=item.product.price
            )
            item.product.stock -= item.quantity
            item.product.save()

        cart.items.all().delete()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

# Payment ViewSet
class PaymentViewSet(viewsets.ViewSet, generics.ListAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsCustomer]
    pagination_class = ItemPaginator

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm_payment(self, request, pk):
        payment = self.get_object()
        if payment.status:
            return Response({"error": "Thanh toán đã được xác nhận."}, status=status.HTTP_400_BAD_REQUEST)

        payment.status = True
        payment.paid_at = timezone.now()
        payment.save()

        order = payment.order
        order.status = 'completed'
        order.save()

        send_fcm_v1(
            request.user,
            title="Thanh toán thành công",
            body=f"Thanh toán cho đơn hàng {order.order_code} đã hoàn tất.",
            data={"order_id": str(order.id)}
        )
        send_mail(
            subject=f"Thanh toán thành công cho đơn hàng {order.order_code}",
            message=f"Kính gửi {request.user.username},\n\nThanh toán cho đơn hàng {order.order_code} đã được xác nhận.\n\nTrân trọng!",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[payment.user.email],
            fail_silently=False,
        )
        return Response({"message": "Thanh toán xác nhận thành công.", "payment": PaymentSerializer(payment).data})

    @action(detail=False, methods=['post'], url_path='create-payment')
    def create_payment(self, request):
        order_id = request.data.get('order_id')
        payment_method = request.data.get('payment_method', 'momo')
        order = get_object_or_404(Order, id=order_id, user=request.user)
        
        if Payment.objects.filter(order=order).exists():
            return Response({"error": "Đơn hàng đã có thanh toán."}, status=status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.create(
            order=order,
            user=request.user,
            amount=order.total_amount,
            payment_method=payment_method,
            transaction_id=str(uuid.uuid4()),
            status=False
        )

        payment_url = f"https://api.momo.vn/pay?amount={payment.amount}&orderId={payment.transaction_id}"
        if payment_method == 'vnpay':
            factory = RequestFactory()
            fake_request = factory.get('/vnpay/create_payment_url/', {'amount': payment.amount})
            response = create_payment_url(fake_request)
            payment_url = response.data['payment_url'] if hasattr(response, 'data') else json.loads(response.content)['payment_url']

        return Response({
            "message": "Tạo thanh toán thành công. Vui lòng hoàn tất thanh toán.",
            "payment": PaymentSerializer(payment).data,
            "payment_url": payment_url
        })

# ChatMessage ViewSet
class ChatMessageViewSet(viewsets.ViewSet, generics.ListCreateAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = ChatMessage.objects.all()
    serializer_class = ChatMessageSerializer
    permission_classes = [IsCustomer, IsChatMessageSender]
    pagination_class = ItemPaginator

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        chat_message = serializer.save(user=request.user, conversation_id=str(uuid.uuid4()))
        
        try:
            response = call_gemini_api(chat_message.message)
        except Exception as e:
            response = f"Lỗi khi xử lý tin nhắn: {str(e)}"
        
        chat_message.response = response
        chat_message.save()

        # Lưu vào Firebase Realtime Database
        save_message_to_firebase(
            user_id=str(request.user.id),
            conversation_id=chat_message.conversation_id,
            message=chat_message.message,
            response=response
        )

        send_fcm_v1(
            request.user,
            title="Phản hồi từ Chatbot",
            body=response[:100] + ('...' if len(response) > 100 else ''),
            data={"conversation_id": chat_message.conversation_id}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='realtime-messages/(?P<conversation_id>[^/.]+)')
    def get_realtime_messages(self, request, conversation_id):
        messages = db.child('chat_messages').child(conversation_id).get().val()
        if not messages:
            return Response({"messages": []}, status=status.HTTP_200_OK)
        messages_list = [msg for msg in messages.values()]
        return Response({"messages": messages_list}, status=status.HTTP_200_OK)

# Admin Statistics View
@api_view(['GET'])
@permission_classes([IsAdmin])
def system_statistics(request):
    total_users = User.objects.count()
    total_orders = Order.objects.count()
    total_revenue = Order.objects.aggregate(total=Sum('total_amount'))['total'] or 0
    pending_products = Product.objects.filter(is_approved=False).count()
    total_interactions = ChatMessage.objects.count()
    trending_categories = OrderItem.objects.values('product__category').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
    trending_products = OrderItem.objects.values('product__name').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
    
    return Response({
        'total_users': total_users,
        'total_orders': total_orders,
        'total_revenue': str(total_revenue),
        'pending_products': pending_products,
        'total_interactions': total_interactions,
        'trending_categories': list(trending_categories),
        'trending_products': list(trending_products),
    })