from django.db.models.signals import post_migrate, pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import User, Product, Order, Payment
from django.db.models import Sum
from django.utils import timezone
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
    if not instance.is_approved and instance.pk:
        # Gửi thông báo FCM khi sản phẩm được duyệt
        old_product = Product.objects.get(pk=instance.pk)
        if old_product.is_approved != instance.is_approved and instance.is_approved:
            send_fcm_v1(
                instance.distributor,
                title="Sản phẩm được duyệt",
                body=f"Sản phẩm {instance.name} đã được duyệt và sẵn sàng bán.",
                data={"product_id": str(instance.id)}
            )

# Cập nhật stock của Product khi Order được tạo
@receiver(post_save, sender=Order)
def update_product_stock(sender, instance, created, **kwargs):
    if created:
        for item in instance.items.all():
            product = item.product
            product.stock -= item.quantity
            product.save()

# Cập nhật stock của Product khi Order bị hủy
@receiver(post_save, sender=Order)
def revert_product_stock_on_cancel(sender, instance, created, **kwargs):
    if not created and instance.status == 'cancelled':
        old_order = Order.objects.get(pk=instance.pk)
        if old_order.status != 'cancelled':
            for item in instance.items.all():
                product = item.product
                product.stock += item.quantity
                product.save()

# Gửi thông báo FCM khi Payment được xác nhận
@receiver(post_save, sender=Payment)
def notify_payment_confirmation(sender, instance, created, **kwargs):
    if not created and instance.status:
        old_payment = Payment.objects.get(pk=instance.pk)
        if not old_payment.status:
            send_fcm_v1(
                instance.user,
                title="Thanh toán thành công",
                body=f"Thanh toán cho đơn hàng {instance.order.order_code} đã được xác nhận.",
                data={"order_id": str(instance.order.id)}
            )

# Cập nhật stock khi OrderItem bị xóa
@receiver(post_delete, sender=Order)
def revert_product_stock_on_order_delete(sender, instance, **kwargs):
    for item in instance.items.all():
        product = item.product
        product.stock += item.quantity
        product.save()