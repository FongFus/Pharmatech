from django.db.models.signals import post_migrate, pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import User, Product, Order, Payment
from .tasks import send_payment_confirmation_email, process_order_refunded, update_inventory_stock, notify_product_approval

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