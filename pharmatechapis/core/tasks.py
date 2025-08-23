from celery import shared_task
from django.utils import timezone
from .models import User, Product, Order, Payment
from .utils import send_fcm_v1, process_refund
from django.core.mail import send_mail
from django.conf import settings

@shared_task
def send_payment_confirmation_email(user_id, order_code):
    """Gửi email xác nhận thanh toán."""
    try:
        user = User.objects.get(id=user_id)
        send_mail(
            subject=f"Thanh toán thành công cho đơn hàng {order_code}",
            message=f"Kính gửi {user.username},\n\nThanh toán cho đơn hàng {order_code} đã được xác nhận.\n\nTrân trọng!",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception as e:
        print(f"Error sending payment confirmation email: {str(e)}")

@shared_task
def process_order_refunded(order_id):
    """Xử lý hoàn tiền khi đơn hàng bị hủy."""
    try:
        order = Order.objects.get(id=order_id)
        payment = Payment.objects.get(order=order)
        if payment.status:
            result = process_refund(payment)
            if result['success']:
                payment.status = 'refunded'
                payment.refunded_at = timezone.now()
                payment.save()
                send_fcm_v1(
                    user=order.user,
                    title="Hoàn tiền thành công",
                    body=f"Đơn hàng {order.order_code} đã được hoàn tiền {payment.amount} VND.",
                    data={"order_id": str(order.id)}
                )
                send_mail(
                    subject=f"Hoàn tiền cho đơn hàng {order.order_code}",
                    message=f"Kính gửi {order.user.username},\n\nHoàn tiền cho đơn hàng {order.order_code} đã được xử lý.\n\nTrân trọng!",
                    from_email=settings.EMAIL_HOST_USER,
                    recipient_list=[order.user.email],
                    fail_silently=False,
                )
            else:
                print(f"Refund failed for order {order.id}: {result['message']}")
    except Payment.DoesNotExist:
        pass
    except Exception as e:
        print(f"Error processing refund for order {order.id}: {str(e)}")

@shared_task
def update_inventory_stock(product_id, quantity_change, is_increase=True):
    """Cập nhật số lượng tồn kho của sản phẩm."""
    try:
        product = Product.objects.get(id=product_id)
        if is_increase:
            product.stock += quantity_change
        else:
            product.stock -= quantity_change
        product.save()
    except Exception as e:
        print(f"Error updating inventory for product {product_id}: {str(e)}")

@shared_task
def notify_product_approval(product_id):
    """Gửi thông báo khi sản phẩm được duyệt."""
    try:
        product = Product.objects.get(id=product_id)
        if product.is_approved:
            send_fcm_v1(
                user=product.distributor,
                title="Sản phẩm được duyệt",
                body=f"Sản phẩm {product.name} đã được duyệt và sẵn sàng bán.",
                data={"product_id": str(product.id)}
            )
            send_mail(
                subject=f"Sản phẩm {product.name} được duyệt",
                message=f"Kính gửi {product.distributor.username},\n\nSản phẩm {product.name} đã được duyệt.\n\nTrân trọng!",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[product.distributor.email],
                fail_silently=False,
            )
    except Exception as e:
        print(f"Error notifying product approval for product {product_id}: {str(e)}")