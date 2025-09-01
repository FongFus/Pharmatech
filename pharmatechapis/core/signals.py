from django.db.models.signals import post_migrate, pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import User, Product, Order, Payment, Notification, Review, ReviewReply
from .tasks import send_payment_confirmation_email, process_order_refunded, update_inventory_stock, notify_product_approval, send_notification_task
from .utils import send_fcm_v1

# Tạo superuser mặc định sau khi migrate
@receiver(post_migrate)
def create_default_superuser(sender, **kwargs):
    User = get_user_model()
    if not User.objects.filter(username='admin').exists():
        User.objects.create_superuser(
            username='admin',
            email='admin@pharmatech.com',
            password='admin123',
            full_name='Admin User'
        )

# Cập nhật trạng thái is_approved của Product trước khi lưu
@receiver(pre_save, sender=Product)
def update_product_status(sender, instance, **kwargs):
    if instance.pk:
        old_product = Product.objects.get(pk=instance.pk)
        if old_product.is_approved != instance.is_approved and instance.is_approved:
            notify_product_approval.delay(instance.id)

# Cập nhật stock của Product khi Order được tạo
@receiver(post_save, sender=Order)
def update_product_stock(sender, instance, created, **kwargs):
    if created:
        for item in instance.items.all():
            update_inventory_stock.delay(item.product.id, item.quantity, is_increase=False)

        # Signal mới: Tạo Notification khi đơn hàng được tạo
        Notification.objects.create(
            user=instance.user,
            title="Đơn hàng được tạo",
            message=f"Đơn hàng {instance.order_code} đã được tạo.",
            notification_type="order",
            related_order=instance
        )
        send_notification_task.delay(instance.user.id, "Đơn hàng được tạo", f"Đơn hàng {instance.order_code} đã được tạo.", "order", order_id=instance.id)

# Cập nhật stock của Product và xử lý hoàn tiền khi Order bị hủy
@receiver(pre_save, sender=Order)
def handle_order_cancellation(sender, instance, **kwargs):
    if instance.pk is not None:
        try:
            old_order = Order.objects.get(pk=instance.pk)
            if old_order.status != 'cancelled' and instance.status == 'cancelled':
                for item in instance.items.all():
                    update_inventory_stock.delay(item.product.id, item.quantity, is_increase=True)
                process_order_refunded.delay(instance.id)
        except Order.DoesNotExist:
            pass

# Gửi thông báo FCM và email khi Payment được xác nhận
@receiver(post_save, sender=Payment)
def notify_payment_confirmation(sender, instance, created, **kwargs):
    if not created and instance.status:
        old_payment = Payment.objects.get(pk=instance.pk)
        if not old_payment.status:
            send_payment_confirmation_email.delay(instance.user.id, instance.order.order_code)

# Cập nhật stock khi Order bị xóa
@receiver(post_delete, sender=Order)
def revert_product_stock_on_order_delete(sender, instance, **kwargs):
    for item in instance.items.all():
        update_inventory_stock.delay(item.product.id, item.quantity, is_increase=True)

# Signal mới: Tạo Notification khi Review được tạo
@receiver(post_save, sender=Review)
def create_notification_on_review(sender, instance, created, **kwargs):
    if created:
        Notification.objects.create(
            user=instance.product.distributor,
            title="Đánh giá mới",
            message=f"Sản phẩm {instance.product.name} nhận được đánh giá {instance.rating} sao.",
            notification_type="product",
            related_product=instance.product
        )
        send_notification_task.delay(instance.product.distributor.id, "Đánh giá mới", f"Sản phẩm {instance.product.name} nhận được đánh giá {instance.rating} sao.", "product", product_id=instance.product.id)

# Signal mới: Tạo Notification khi ReviewReply được tạo
@receiver(post_save, sender=ReviewReply)
def create_notification_on_review_reply(sender, instance, created, **kwargs):
    if created:
        review_user = instance.review.user
        Notification.objects.create(
            user=review_user,
            title="Phản hồi đánh giá",
            message=f"Đánh giá của bạn cho sản phẩm {instance.review.product.name} đã được phản hồi.",
            notification_type="product",
            related_product=instance.review.product
        )
        send_notification_task.delay(review_user.id, "Phản hồi đánh giá", f"Đánh giá của bạn cho sản phẩm {instance.review.product.name} đã được phản hồi.", "product", product_id=instance.review.product.id)
