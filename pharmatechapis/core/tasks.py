from celery import shared_task
from django.utils import timezone
from .models import User, Product, Order, Payment, Notification, Review, ReviewReply
from .utils import send_fcm_v1, process_stripe_refund
from django.core.mail import send_mail
from django.conf import settings
from .utils import scrape_website, store_scraped_data
import logging
import asyncio
import aiohttp

logger = logging.getLogger(__name__)

@shared_task
def send_payment_confirmation_email(user_id, order_code):
    """Gửi email xác nhận thanh toán."""
    try:
        user = User.objects.get(id=user_id)
        send_mail(
            subject=f"Thanh toán thành công cho đơn hàng {order_code}",
            message=f"Kính gửi {user.username},\n\nThanh toán cho đơn hàng {order_code} qua Stripe đã được xác nhận.\n\nTrân trọng!",
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
        if payment.status == 'completed':
            result = process_stripe_refund(payment)
            if result['success']:
                payment.status = 'refunded'
                payment.refunded_at = timezone.now()
                payment.save()
                send_fcm_v1(
                    user=order.user,
                    title="Hoàn tiền thành công",
                    body=f"Đơn hàng {order.order_code} đã được hoàn tiền {payment.amount} VND qua Stripe.",
                    data={"order_id": str(order.id)}
                )
                send_mail(
                    subject=f"Hoàn tiền cho đơn hàng {order.order_code}",
                    message=f"Kính gửi {order.user.username},\n\nHoàn tiền cho đơn hàng {order.order_code} đã được xử lý qua Stripe.\n\nTrân trọng!",
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

@shared_task
def send_notification_task(user_id, title, message, notification_type, order_id=None, product_id=None):
    """Gửi thông báo FCM cho người dùng."""
    try:
        user = User.objects.get(id=user_id)
        data = {}
        if order_id:
            data["order_id"] = str(order_id)
        if product_id:
            data["product_id"] = str(product_id)
        send_fcm_v1(
            user=user,
            title=title,
            body=message,
            data=data
        )
    except Exception as e:
        print(f"Error sending notification to user {user_id}: {str(e)}")

@shared_task
def create_order_notification(order_id):
    """Tạo thông báo cho đơn hàng mới."""
    try:
        order = Order.objects.get(id=order_id)
        Notification.objects.create(
            user=order.user,
            title="Đơn hàng được tạo",
            message=f"Đơn hàng {order.order_code} đã được tạo.",
            notification_type="order",
            related_order=order
        )
        send_fcm_v1(
            user=order.user,
            title="Đơn hàng được tạo",
            body=f"Đơn hàng {order.order_code} đã được tạo.",
            data={"order_id": str(order.id)}
        )
        send_mail(
            subject=f"Đơn hàng {order.order_code} được tạo",
            message=f"Kính gửi {order.user.username},\n\nĐơn hàng {order.order_code} đã được tạo.\n\nTrân trọng!",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[order.user.email],
            fail_silently=False,
        )
    except Exception as e:
        print(f"Error creating order notification for order {order_id}: {str(e)}")

@shared_task
def notify_review_creation(review_id):
    """Thông báo cho nhà phân phối khi có đánh giá mới."""
    try:
        review = Review.objects.get(id=review_id)
        Notification.objects.create(
            user=review.product.distributor,
            title="Đánh giá mới",
            message=f"Sản phẩm {review.product.name} nhận được đánh giá {review.rating} sao.",
            notification_type="product",
            related_product=review.product
        )
        send_fcm_v1(
            user=review.product.distributor,
            title="Đánh giá mới",
            body=f"Sản phẩm {review.product.name} nhận được đánh giá {review.rating} sao.",
            data={"product_id": str(review.product.id)}
        )
    except Exception as e:
        print(f"Error notifying review creation for review {review_id}: {str(e)}")

@shared_task
def notify_review_reply(review_reply_id):
    """Thông báo cho khách hàng khi có phản hồi đánh giá."""
    try:
        review_reply = ReviewReply.objects.get(id=review_reply_id)
        review_user = review_reply.review.user
        Notification.objects.create(
            user=review_user,
            title="Phản hồi đánh giá",
            message=f"Đánh giá của bạn cho sản phẩm {review_reply.review.product.name} đã được phản hồi.",
            notification_type="product",
            related_product=review_reply.review.product
        )
        send_fcm_v1(
            user=review_user,
            title="Phản hồi đánh giá",
            body=f"Đánh giá của bạn cho sản phẩm {review_reply.review.product.name} đã được phản hồi.",
            data={"product_id": str(review_reply.review.product.id)}
        )
    except Exception as e:
        print(f"Error notifying review reply for reply {review_reply_id}: {str(e)}")

@shared_task
def scrape_and_store_websites(urls):
    """
    Cào và lưu dữ liệu từ danh sách các URL bất đồng bộ.
    """
    async def main(urls):
        urls = urls[:2]  # Giới hạn 2 URL
        tasks = [scrape_website(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for url, result in zip(urls, results):
            if isinstance(result, Exception):
                logger.error(f"Lỗi khi cào dữ liệu từ {url}: {str(result)}")
                continue
            if not isinstance(result, dict):
                logger.error(f"Kết quả không phải dictionary từ {url}: {result}")
                continue
            if result.get('success'):
                logger.debug(f"scrape_website result: {result}")
                store_result = store_scraped_data(result)
                if store_result.get('success'):
                    logger.info(f"Đã cào và lưu dữ liệu từ {url}")
                else:
                    logger.error(f"Lỗi khi lưu dữ liệu từ {url}: {store_result.get('error', 'Lỗi không xác định')}")
            else:
                logger.error(f"Lỗi khi cào dữ liệu từ {url}: {result.get('error', 'Lỗi không xác định')}")
    
    # Sử dụng event loop mới để tránh xung đột trên Windows
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(main(urls))
    finally:
        loop.close()