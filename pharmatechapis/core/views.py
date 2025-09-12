from rest_framework import viewsets, generics, status, filters, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters import rest_framework as filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Avg
from django.shortcuts import get_object_or_404
from django.core.mail import send_mail
from django.core.cache import cache
from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from .models import User, Product, Cart, CartItem, Order, OrderItem, Payment, DeviceToken, Category, Inventory, Notification, Review, ReviewReply, Discount
from .serializers import (
    UserSerializer, UserDetailSerializer, ProductSerializer, CartSerializer,
    CartItemSerializer, OrderSerializer, OrderItemSerializer, PaymentSerializer,
    DeviceTokenSerializer, AdminProductApprovalSerializer, CategorySerializer, InventorySerializer,
    PasswordResetSerializer, ChangePasswordSerializer, DiscountSerializer, NotificationSerializer, ReviewSerializer, ReviewReplySerializer
)
from .permissions import (
    IsCustomer, IsDistributor, IsAdmin, IsCartOwner, IsOrderOwner, IsProductOwner, IsInventoryManager, IsCategoryManager, IsPaymentManager, IsConversationViewer, IsNotificationOwner, IsReviewOwner, IsAdminOrDistributor
)
from rest_framework.permissions import AllowAny
from .paginators import ItemPaginator
from .utils import send_fcm_v1, save_message_to_firebase, generate_reset_code, create_stripe_checkout_session, process_stripe_refund
from .authentication import CustomOAuth2Authentication
from django.http import JsonResponse, HttpResponse
import uuid
import hashlib
import hmac
from urllib.parse import quote_plus
from datetime import datetime, timedelta
import pytz
from django.test import RequestFactory
from .utils import call_gemini_api, save_message_to_firebase, send_fcm_v1
import pyrebase
import stripe
from .tasks import send_payment_confirmation_email, notify_product_approval
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth import get_user_model
from rest_framework import serializers
from decimal import Decimal
import logging
import socket
from firebase_admin import db


firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)
# db = firebase.database()

logger = logging.getLogger(__name__)


# Serializer cho dữ liệu tin nhắn từ Firebase
class ChatMessageSerializer(serializers.Serializer):
    user = serializers.CharField(read_only=True)
    message = serializers.CharField()
    response = serializers.CharField(read_only=True, allow_null=True)
    conversation_id = serializers.CharField(read_only=True, allow_null=True)
    created_at = serializers.CharField(read_only=True)

    def validate(self, data):
        user = self.context['request'].user
        if user.role != 'customer':
            raise serializers.ValidationError("Chỉ khách hàng mới có thể gửi tin nhắn đến chatbot.")
        return data

# Ping view to keep server alive
@api_view(['GET'])
def ping_view(request):
    return JsonResponse({"status": "alive"})

# System Statistics
@api_view(['GET'])
@permission_classes([IsAdmin])
def system_statistics(request):
    orders = Order.objects.prefetch_related('items')
    total_revenue = sum(order.total_amount for order in orders)
    total_users = User.objects.count()
    total_orders = orders.count()
    pending_products = Product.objects.filter(is_approved=False).count()

    # ✅ Sửa đoạn này:
    conversations_ref = db.reference('chat_messages')
    conversations = conversations_ref.get() or {}
    total_interactions = sum(len(msgs) for msgs in conversations.values())

    trending_categories = OrderItem.objects.values('product__category').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
    trending_products = OrderItem.objects.values('product__name').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]

    valid_discount_count = Discount.objects.filter(is_active=True).count()
    review_count = Review.objects.count()
    avg_rating = Review.objects.aggregate(avg_rating=Avg('rating'))['avg_rating'] or 0
    unread_notification_count = Notification.objects.filter(is_read=False).count()

    return Response({
        'total_users': total_users,
        'total_orders': total_orders,
        'total_revenue': str(total_revenue),
        'pending_products': pending_products,
        'total_interactions': total_interactions,
        'trending_categories': list(trending_categories),
        'trending_products': list(trending_products),
        'valid_discount_count': valid_discount_count,
        'review_count': review_count,
        'avg_rating': avg_rating,
        'unread_notification_count': unread_notification_count,
    })

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
        if self.action in ['list', 'admin_change_user_active_state', 'destroy']:
            return [IsAdmin()]
        elif self.action in ['get_current_user', 'deactivate', 'logout', 'fcm_token', 'retrieve', 'partial_update', 'change-password']:
            return [permissions.IsAuthenticated()]
        elif self.action in ['create', 'password_reset_request', 'password_reset_confirm']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def retrieve(self, request, pk=None):
        """Lấy thông tin chi tiết của user"""
        user = get_object_or_404(User, pk=pk)
        if not (request.user.role == 'admin' or request.user.id == user.id):
            return Response({'error': 'Không có quyền truy cập'}, status=status.HTTP_403_FORBIDDEN)
        serializer = UserDetailSerializer(user, context={'request': request})
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        """Cập nhật một phần thông tin user"""
        user = get_object_or_404(User, pk=pk)
        if not (request.user.role == 'admin' or request.user.id == user.id):
            return Response({'error': 'Không có quyền cập nhật'}, status=status.HTTP_403_FORBIDDEN)
        serializer = UserSerializer(user, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, pk=None):
        """Xóa user"""
        user = get_object_or_404(User, pk=pk)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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

    @action(methods=['post'], detail=False, url_path='logout')
    def logout(self, request):
        """Đăng xuất người dùng"""
        try:
            token = request.auth
            if token:
                token.revoke()
            return Response({"message": "Đăng xuất thành công."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": f"Lỗi khi đăng xuất: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(methods=['post'], detail=False, url_path='fcm_token')
    def fcm_token(self, request):
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

    @action(methods=['post'], detail=False, url_path='password-reset-request')
    def password_reset_request(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'message': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'message': 'User with this email does not exist.'}, status=status.HTTP_404_NOT_FOUND)

        token = default_token_generator.make_token(user)
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        code = generate_reset_code(uidb64, token)  # Tạo mã code 6 ký tự

        # Lưu uidb64, token và code vào cache (hết hạn sau 30 phút)
        cache_key = f"password_reset_{user.pk}"
        cache.set(cache_key, {'uidb64': uidb64, 'token': token, 'code': code}, timeout=1800)

        # Gửi email chứa mã code
        send_mail(
            subject="Đặt lại mật khẩu",
            message=f"Kính gửi {user.username},\n\nMã xác nhận đặt lại mật khẩu của bạn là: {code}\n\nVui lòng sử dụng mã này để đặt lại mật khẩu.\n\nTrân trọng!",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return Response({'message': 'Password reset code sent to email.'}, status=status.HTTP_200_OK)

    @action(methods=['post'], detail=False, url_path='password-reset-confirm')
    def password_reset_confirm(self, request):
        code = request.data.get('code')
        new_password = request.data.get('new_password')

        if not code or not new_password:
            return Response({'message': 'Code and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Tìm user_id từ cache dựa trên code
        user_id = None
        cached_data = None
        for key in cache.keys("password_reset_*"):
            data = cache.get(key)
            if data and data.get('code') == code:
                cached_data = data
                user_id = int(key.replace("password_reset_", ""))
                break

        if not cached_data:
            return Response({'message': 'Invalid or expired reset code.'}, status=status.HTTP_400_BAD_REQUEST)

        uidb64 = cached_data['uidb64']
        token = cached_data['token']

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'message': 'Invalid reset code.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'message': 'Invalid reset code.'}, status=status.HTTP_400_BAD_REQUEST)

        # Xác thực new_password qua serializer
        serializer = PasswordResetSerializer(data={'new_password': new_password})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.save()

        # Xóa cache sau khi đặt lại mật khẩu
        cache.delete(f"password_reset_{user.pk}")

        return Response({'message': 'Password reset successfully.'}, status=status.HTTP_200_OK)

    @action(methods=['post'], detail=False, url_path='change-password')
    def change_password(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = request.user
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({'message': 'Password changed successfully.'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProductFilter(filters.FilterSet):
    price__gte = filters.NumberFilter(field_name='price', lookup_expr='gte')
    price__lte = filters.NumberFilter(field_name='price', lookup_expr='lte')

    class Meta:
        model = Product
        fields = ['category', 'is_approved', 'price', 'price__gte', 'price__lte']
        
# Product ViewSet
class ProductViewSet(viewsets.ViewSet, generics.ListAPIView, generics.CreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    serializer_class = ProductSerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = ProductFilter  # Sử dụng FilterSet tùy chỉnh
    search_fields = ['name', 'description']
    ordering_fields = ['price', 'created_at']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        if self.action in ['list', 'retrieve'] and not user.is_authenticated:
            return Product.objects.filter(is_approved=True)
        if self.action == 'my_products':
            return Product.objects.filter(distributor=user)
        if self.action in ['approve', 'update', 'partial_update', 'destroy']:
            return Product.objects.all()
        if self.action == 'review':
            return Product.objects.filter(is_approved=False)
        return Product.objects.filter(is_approved=True)

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        elif self.action in ['create', 'my_products']:
            return [IsDistributor()]
        elif self.action in ['update', 'partial_update', 'destroy', 'unapprove']:
            return [IsDistributor(), IsProductOwner()]
        elif self.action in ['approve', 'review']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        product = self.get_object()
        product.is_approved = True
        product.save()
        # notify_product_approval.delay(product.id)
        return Response({"message": "Trạng thái duyệt sản phẩm đã được cập nhật."})

    @action(detail=True, methods=['post'], url_path='unapprove')
    def unapprove(self, request, pk=None):
        product = self.get_object()
        product.is_approved = False
        product.save()
        # notify_product_approval.delay(product.id)
        return Response({"message": "Sản phẩm đã bị vô hiệu"})

    @action(detail=False, methods=['get'], url_path='review')
    def review(self, request):
        queryset = Product.objects.filter(is_approved=False)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my-products')
    def my_products(self, request):
        queryset = Product.objects.filter(distributor=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

# Cart ViewSet
class CartViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Cart.objects.all()
    serializer_class = CartSerializer
    permission_classes = [IsCustomer]
    pagination_class = ItemPaginator

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return self.queryset.filter(user=self.request.user)
        return self.queryset.none()

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        cart = self.get_object()
        serializer = CartItemSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(cart=cart)
        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='remove-item')
    def remove_item(self, request, pk=None):
        cart = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({"error": "Thiếu item_id."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = cart.items.get(id=item_id)
            item.delete()
            return Response(CartSerializer(cart).data)
        except CartItem.DoesNotExist:
            return Response({"error": "Mặt hàng không tồn tại trong giỏ hàng."}, status=status.HTTP_404_NOT_FOUND)

# Order ViewSet
class OrderViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [IsCustomer, IsOrderOwner]
    pagination_class = ItemPaginator

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return self.queryset.filter(user=self.request.user)
        return self.queryset.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status != 'pending':
            return Response({'message': 'Order cannot be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

        order.status = 'cancelled'
        order.save()
        return Response({'message': 'Order cancelled.'})

    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

# Payment ViewSet
class PaymentViewSet(viewsets.ViewSet, generics.ListAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    pagination_class = ItemPaginator

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'create_stripe_payment', 'confirm_payment', 'handle_success', 'handle_cancel']:
            return [IsCustomer()]
        elif self.action in ['refund_payment']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            if self.request.user.role == 'customer':
                return self.queryset.filter(user=self.request.user)
            elif self.request.user.role == 'admin':
                return self.queryset
        return Payment.objects.none()

    def retrieve(self, request, pk=None):
        try:
            payment = self.get_queryset().get(pk=pk)
        except Payment.DoesNotExist:
            return Response({"error": "Không tìm thấy thanh toán."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(payment)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='create-stripe-payment')
    def create_stripe_payment(self, request):
        """Tạo Stripe Checkout Session cho thanh toán."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'Order ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(id=order_id, user=request.user)
            if order.status != 'pending':
                return Response({'error': 'Chỉ đơn hàng đang chờ xử lý mới có thể thanh toán.'}, status=status.HTTP_400_BAD_REQUEST)

            if Payment.objects.filter(order=order).exists():
                return Response({'error': 'Đơn hàng này đã có thanh toán.'}, status=status.HTTP_400_BAD_REQUEST)

            result = create_stripe_checkout_session(order, request.user)
            if not result['success']:
                return Response({'error': result['message']}, status=status.HTTP_400_BAD_REQUEST)

            payment = Payment.objects.create(
                order=order,
                user=request.user,
                amount=order.total_amount,
                payment_method='stripe',
                status='pending',
                transaction_id=result['session_id']
            )

            return Response({
                'checkout_url': result['checkout_url'],
                'payment_id': payment.id,
                'order_code': order.order_code
            }, status=status.HTTP_201_CREATED)

        except Order.DoesNotExist:
            return Response({'error': 'Không tìm thấy đơn hàng.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='confirm-payment')
    def confirm_payment(self, request, pk=None):
        """Xác nhận thanh toán Stripe Checkout."""
        try:
            payment = self.get_queryset().get(pk=pk)
            if payment.user != request.user:
                return Response({'error': 'Không có quyền xác nhận thanh toán này.'}, status=status.HTTP_403_FORBIDDEN)

            session = stripe.checkout.Session.retrieve(payment.transaction_id)
            if session.payment_status == 'paid':
                payment.status = 'completed'
                payment.paid_at = timezone.now()
                payment.save()
                send_payment_confirmation_email.delay(
                    user_id=payment.user.id,
                    order_code=payment.order.order_code
                )
                return Response({'message': 'Thanh toán đã được xác nhận.'}, status=status.HTTP_200_OK)
            else:
                payment.status = 'failed'
                payment.save()
                return Response({'error': 'Thanh toán không thành công.'}, status=status.HTTP_400_BAD_REQUEST)

        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy thanh toán.'}, status=status.HTTP_404_NOT_FOUND)
        except stripe.error.StripeError as e:
            return Response({'error': f"Lỗi Stripe: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='refund')
    def refund_payment(self, request, pk=None):
        """Hoàn tiền cho thanh toán (chỉ admin)."""
        try:
            payment = self.get_queryset().get(pk=pk)
            if payment.status != 'completed':
                return Response({'error': 'Chỉ có thể hoàn tiền cho thanh toán đã hoàn tất.'}, status=status.HTTP_400_BAD_REQUEST)

            result = process_stripe_refund(payment)
            if result['success']:
                payment.status = 'refunded'
                payment.refunded_at = timezone.now()
                payment.save()
                return Response({'message': 'Hoàn tiền thành công.'}, status=status.HTTP_200_OK)
            return Response({'error': result['message']}, status=status.HTTP_400_BAD_REQUEST)

        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy thanh toán.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='success', permission_classes=[AllowAny])
    def handle_success(self, request):
        """Xử lý điều hướng sau khi thanh toán thành công từ Stripe."""
        session_id = request.query_params.get('session_id')
        if not session_id:
            logger.error("Missing session_id in /success/ request")
            return Response({'error': 'Thiếu session_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Lấy thông tin Checkout Session
            session = stripe.checkout.Session.retrieve(session_id, expand=['payment_intent'])
            payment = Payment.objects.get(transaction_id=session_id)
            payment_intent = session.payment_intent

            logger.info(f"Processing /success/ for session_id: {session_id}, "
                        f"session_payment_status: {session.payment_status}, "
                        f"payment_intent_status: {payment_intent.status if payment_intent else 'N/A'}, "
                        f"current_payment_status: {payment.status}")

            # Kiểm tra trạng thái thanh toán
            if session.payment_status == 'paid' or (payment_intent and payment_intent.status == 'succeeded'):
                if payment.status != 'completed':
                    payment.status = 'completed'
                    payment.paid_at = timezone.now()
                    payment.save()
                    # Cập nhật trạng thái đơn hàng
                    payment.order.status = 'completed'
                    payment.order.save()
                    send_payment_confirmation_email.delay(
                        user_id=payment.user.id,
                        order_code=payment.order.order_code
                    )
                    logger.info(f"Payment {payment.id} updated to completed for order {payment.order.order_code}")
                else:
                    logger.info(f"Payment {payment.id} already completed, skipping update")
                return Response({
                    'message': 'Thanh toán thành công.',
                    'payment_id': payment.id,
                    'order_code': payment.order.order_code,
                    'status': payment.status
                }, status=status.HTTP_200_OK)
            else:
                if payment.status != 'failed':
                    payment.status = 'failed'
                    payment.save()
                    logger.info(f"Payment {payment.id} updated to failed")
                return Response({
                    'error': 'Thanh toán không thành công.',
                    'status': payment.status,
                    'session_payment_status': session.payment_status,
                    'payment_intent_status': payment_intent.status if payment_intent else 'N/A'
                }, status=status.HTTP_400_BAD_REQUEST)

        except Payment.DoesNotExist:
            logger.error(f"Payment not found for session_id: {session_id}")
            return Response({'error': 'Không tìm thấy thanh toán.'}, status=status.HTTP_404_NOT_FOUND)
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error for session_id {session_id}: {str(e)}")
            return Response({'error': f"Lỗi Stripe: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected error for session_id {session_id}: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='cancel', permission_classes=[AllowAny])
    def handle_cancel(self, request):
        """Xử lý điều hướng khi thanh toán bị hủy."""
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response({'error': 'Thiếu session_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = Payment.objects.get(transaction_id=session_id)
            payment.status = 'failed'
            payment.save()
            # Cập nhật trạng thái đơn hàng
            payment.order.status = 'cancelled'
            payment.order.save()
            return Response({
                'message': 'Thanh toán đã bị hủy.',
                'status': payment.status
            }, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy thanh toán.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Category ViewSet
class CategoryViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsCategoryManager]
    pagination_class = ItemPaginator

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [IsCategoryManager()]

# Inventory ViewSet
class InventoryViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.RetrieveAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Inventory.objects.all()
    serializer_class = InventorySerializer
    permission_classes = [IsDistributor, IsInventoryManager]
    pagination_class = ItemPaginator
    filter_backends = [SearchFilter]
    search_fields = ['product__name']

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return self.queryset.filter(distributor=self.request.user).select_related('product')
        return self.queryset.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(distributor=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """Bulk create inventory items"""
        items_data = request.data
        if not isinstance(items_data, list):
            return Response({'error': 'Expected a list of inventory items'}, status=status.HTTP_400_BAD_REQUEST)

        created_items = []
        errors = []

        for i, item_data in enumerate(items_data):
            serializer = self.get_serializer(data=item_data, context={'request': request})
            if serializer.is_valid():
                try:
                    inventory_item = serializer.save(distributor=request.user)
                    created_items.append(serializer.data)
                except Exception as e:
                    errors.append({'index': i, 'error': str(e), 'data': item_data})
            else:
                errors.append({'index': i, 'error': serializer.errors, 'data': item_data})

        response_data = {
            'created_count': len(created_items),
            'error_count': len(errors),
            'created_items': created_items,
            'errors': errors
        }

        if errors:
            return Response(response_data, status=status.HTTP_207_MULTI_STATUS)
        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['delete'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Bulk delete inventory items"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'No IDs provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Filter items that belong to the current user
        user_inventory = self.get_queryset()
        items_to_delete = user_inventory.filter(id__in=ids)

        deleted_count = items_to_delete.count()
        items_to_delete.delete()

        return Response({
            'message': f'Successfully deleted {deleted_count} inventory items',
            'deleted_count': deleted_count
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """Get inventory items with low stock (quantity < threshold)"""
        threshold = request.query_params.get('threshold', 10)
        try:
            threshold = int(threshold)
        except ValueError:
            threshold = 10

        queryset = self.get_queryset().filter(quantity__lt=threshold)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

# Discount ViewSet
class DiscountViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.UpdateAPIView, generics.DestroyAPIView, generics.RetrieveAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'discount_type']
    search_fields = ['code']
    ordering_fields = ['created_at', 'discount_value']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if self.action in ['list', 'retrieve']:
            now = timezone.now()
            return Discount.objects.filter(is_active=True, start_date__lte=now, end_date__gte=now)
        return super().get_queryset()

    @action(detail=False, methods=['post'], url_path='apply')
    def apply_discount(self, request):
        discount_code = request.data.get('discount_code')
        order_id = request.data.get('order_id')

        if not discount_code or not order_id:
            return Response({'error': 'discount_code và order_id là bắt buộc.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            discount = Discount.objects.get(code=discount_code)
        except Discount.DoesNotExist:
            return Response({'error': 'Mã giảm giá không tồn tại.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        if not discount.is_active or discount.start_date > now or discount.end_date < now:
            return Response({'error': 'Mã giảm giá không hợp lệ hoặc đã hết hạn.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Đơn hàng không tồn tại.'}, status=status.HTTP_404_NOT_FOUND)

        valid, message = discount.is_valid(order.total_amount)
        if not valid:
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        # Tính discount_amount
        if discount.discount_type == 'percentage':
            discount_amount = order.total_amount * (discount.discount_value / 100)
            if discount.max_discount_amount:
                discount_amount = min(discount_amount, discount.max_discount_amount)
        else:
            discount_amount = discount.discount_value

        return Response({'discount_amount': str(discount_amount)}, status=status.HTTP_200_OK)

# Notification ViewSet
class NotificationViewSet(viewsets.ViewSet, generics.ListAPIView, generics.RetrieveAPIView, generics.UpdateAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    serializer_class = NotificationSerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_read', 'notification_type']
    search_fields = ['notification_type']
    ordering_fields = ['created_at']

    def get_permissions(self):
        user = self.request.user
        if user.role == 'admin':
            return [IsAdmin()]
        return [IsNotificationOwner()]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            user = self.request.user
            if user.role == 'admin':
                return Notification.objects.all()
            return Notification.objects.filter(user=user)
        return Notification.objects.none()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        notification = self.get_object()
        serializer = self.get_serializer(notification)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='mark-as-read')
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        serializer = self.get_serializer(notification)
        return Response(serializer.data)

# Review ViewSet
class ReviewViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.RetrieveAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['product', 'user', 'rating']
    search_fields = ['comment']
    ordering_fields = ['created_at', 'rating']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        elif self.action == 'create':
            return [IsCustomer()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsReviewOwner(), IsAdminOrDistributor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            user = self.request.user
            if self.action in ['list', 'retrieve', 'product_reviews']:
                return Review.objects.all()
            elif user.role == 'customer':
                return Review.objects.filter(user=user)
            elif user.role == 'distributor':
                return Review.objects.filter(product__distributor=user)
            elif user.role == 'admin':
                return Review.objects.all()
        return Review.objects.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='my-reviews', permission_classes=[IsDistributor])
    def my_reviews(self, request):
        """
        Lấy danh sách review của các sản phẩm do nhà phân phối sở hữu.
        """
        queryset = Review.objects.filter(product__distributor=request.user)
        queryset = self.filter_queryset(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get', 'post'], url_path='product/(?P<product_id>\d+)/reviews')
    def product_reviews(self, request, product_id=None):
        """
        Lấy danh sách review của một sản phẩm dựa trên product_id hoặc tạo review mới cho sản phẩm đó.
        Hỗ trợ phân trang, lọc theo rating và sắp xếp theo created_at hoặc rating.
        """
        # Kiểm tra sản phẩm tồn tại
        product = get_object_or_404(Product, id=product_id, is_approved=True)

        if request.method == 'GET':
            # Lấy queryset review cho sản phẩm
            queryset = self.get_queryset().filter(product=product)
            queryset = self.filter_queryset(queryset)

            # Phân trang
            page = self.paginate_queryset(queryset)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)

            # Serialize dữ liệu nếu không phân trang
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            # Tạo review mới cho sản phẩm
            data = request.data.copy()
            data['product'] = product_id  # Set product from URL
            serializer = self.get_serializer(data=data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

# ReviewReply ViewSet
class ReviewReplyViewSet(viewsets.ViewSet, generics.ListCreateAPIView, generics.RetrieveAPIView, generics.UpdateAPIView, generics.DestroyAPIView):
    authentication_classes = [CustomOAuth2Authentication]
    queryset = ReviewReply.objects.all()
    serializer_class = ReviewReplySerializer
    pagination_class = ItemPaginator
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['review', 'user']
    search_fields = ['reply']
    ordering_fields = ['created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        elif self.action == 'create':
            return [IsDistributor()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAdminOrDistributor()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            user = self.request.user
            if self.action in ['list', 'retrieve']:
                return ReviewReply.objects.all()
            elif user.role == 'distributor':
                return ReviewReply.objects.filter(user=user)
            elif user.role == 'admin':
                return ReviewReply.objects.all()
        return ReviewReply.objects.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

# ChatMessage ViewSet
class ChatMessageViewSet(viewsets.ViewSet):
    def create(self, request):
        user = request.user
        message = request.data.get('message')
        conversation_id = request.data.get('conversation_id', str(uuid.uuid4()))

        if not message:
            return Response({'error': 'Tin nhắn không được để trống.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Gọi Gemini API để lấy phản hồi
            response_text = call_gemini_api(message)
            # Lưu tin nhắn và phản hồi vào Firebase
            result = save_message_to_firebase(user.id, conversation_id, message, response_text)
            if not result['success']:
                return Response({'error': result['message']}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Gửi thông báo FCM (nếu cần)
            send_fcm_v1(user, "Phản hồi chatbot", response_text)

            return Response({
                'conversation_id': conversation_id,
                'message': message,
                'response': response_text
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='realtime-messages/(?P<conversation_id>[^/.]+)')
    def get_realtime_messages(self, request, conversation_id=None):
        try:
            ref = db.reference(f'chat_messages/{conversation_id}')
            messages = ref.get()
            if not messages:
                return Response({'messages': []}, status=status.HTTP_200_OK)
            messages_list = [
                {'message_id': k, **v} for k, v in messages.items()
                if v['user_id'] == str(request.user.id)
            ]
            return Response({'messages': messages_list}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f"Lỗi khi lấy tin nhắn: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='history')
    def get_history(self, request):
        try:
            ref = db.reference('chat_messages')
            all_messages = ref.get()
            history = []
            if all_messages:
                for conv_id, messages in all_messages.items():
                    for msg_id, msg in messages.items():
                        if msg['user_id'] == str(request.user.id):
                            history.append({'conversation_id': conv_id, 'message_id': msg_id, **msg})
            return Response({'history': history}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f"Lỗi khi lấy lịch sử: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)