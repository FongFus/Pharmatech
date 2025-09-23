from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from cloudinary.models import CloudinaryField
from decimal import Decimal
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import transaction
from django.db.models import F

# Custom User Manager
class CustomUserManager(BaseUserManager):
    def create_user(self, username, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        if not username:
            raise ValueError('The Username field must be set')
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('role', 'admin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(username, email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    username = models.CharField(max_length=50, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128)
    role = models.CharField(max_length=20, choices=[('customer', 'Customer'), ('distributor', 'Distributor'), ('admin', 'Admin')], default='customer')
    full_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    avatar = CloudinaryField('avatar', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email', 'full_name']

    class Meta:
        indexes = [models.Index(fields=['role']), models.Index(fields=['created_at'])]

    def __str__(self):
        return self.username or self.email

class Category(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name

class Product(models.Model):
    distributor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='products', limit_choices_to={'role': 'distributor'})
    name = models.CharField(max_length=100)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = CloudinaryField('image', null=True, blank=True)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['distributor']), models.Index(fields=['created_at'])]

    def __str__(self):
        return self.name

    @property
    def total_stock(self):
        """Tính tổng số lượng tồn kho từ tất cả bản ghi Inventory."""
        return self.inventory.aggregate(total=models.Sum('quantity'))['total'] or 0

class Inventory(models.Model):
    distributor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='inventory', limit_choices_to={'role': 'distributor'})
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventory')
    quantity = models.PositiveIntegerField()
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['distributor', 'product'])]
        unique_together = ('distributor', 'product')

    def __str__(self):
        return f"{self.product.name} - {self.quantity}"

class Cart(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='carts', limit_choices_to={'role': 'customer'})
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['user']), models.Index(fields=['created_at'])]

    def __str__(self):
        return f"Cart for {self.user.username}"

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    class Meta:
        indexes = [models.Index(fields=['cart', 'product'])]

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

class Discount(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, null=True)
    discount_type = models.CharField(
        max_length=20,
        choices=[('percentage', 'Percentage'), ('fixed', 'Fixed Amount')],
        default='percentage'
    )
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    max_discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Maximum discount amount for percentage-based discounts."
    )
    min_order_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="Minimum order value to apply this discount."
    )
    start_date = models.DateTimeField(default=timezone.now)
    end_date = models.DateTimeField()
    max_uses = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of times this discount can be used."
    )
    uses_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['code', 'is_active'])]
        verbose_name = "Discount"
        verbose_name_plural = "Discounts"

    def __str__(self):
        return self.code

    def is_valid(self, order_amount):
        """Kiểm tra xem mã giảm giá có hợp lệ không."""
        now = timezone.now()
        if not self.is_active:
            return False, "Discount is not active."
        if now < self.start_date or now > self.end_date:
            return False, "Discount is expired or not yet active."
        if self.max_uses and self.uses_count >= self.max_uses:
            return False, "Discount has reached maximum uses."
        if self.min_order_value and order_amount < self.min_order_value:
            return False, f"Order amount must be at least {self.min_order_value}."
        return True, "Discount is valid."

class Order(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders', limit_choices_to={'role': 'customer'})
    order_code = models.CharField(max_length=20, unique=True)
    discount = models.ForeignKey(Discount, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=20, choices=[('pending', 'Pending'), ('processing', 'Processing'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'status']), models.Index(fields=['created_at'])]

    def __str__(self):
        return f"Order {self.order_code}"

    @property
    def total_amount(self):
        """Tính tổng số tiền từ các OrderItem, trừ đi discount_amount."""
        items_total = sum(item.quantity * item.price for item in self.items.all())
        return max(Decimal('0.00'), items_total - self.discount_amount)

    @transaction.atomic
    def apply_discount(self):
        """Áp dụng mã giảm giá cho đơn hàng trong transaction."""
        if not self.discount:
            self.discount_amount = Decimal('0.00')
            self.save()
            return

        items_total = sum(item.quantity * item.price for item in self.items.all())
        is_valid, message = self.discount.is_valid(items_total)
        if is_valid:
            if self.discount.discount_type == 'percentage':
                discount_amount = items_total * (self.discount.discount_value / 100)
                if self.discount.max_discount_amount:
                    discount_amount = min(discount_amount, self.discount.max_discount_amount)
            else:  # fixed
                discount_amount = self.discount.discount_value
            self.discount_amount = discount_amount
            self.discount.uses_count = F('uses_count') + 1
            self.discount.save()
            self.discount.refresh_from_db()
            self.save()
        else:
            raise ValueError(message)

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        indexes = [models.Index(fields=['order', 'product'])]

    def __str__(self):
        return f"{self.quantity} x {self.product.name} in Order {self.order.order_code}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        """Kiểm tra và cập nhật tồn kho trong transaction để tránh race conditions."""
        inventory = Inventory.objects.select_for_update().get(
            product=self.product, distributor=self.product.distributor
        )
        if self.quantity > inventory.quantity:
            raise ValueError(f"Cannot add {self.quantity} items, only {inventory.quantity} in stock.")
        inventory.quantity = F('quantity') - self.quantity
        inventory.save()
        super().save(*args, **kwargs)

class Payment(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(
        max_length=20,
        choices=[('stripe', 'Stripe')],
        default='stripe'
    )
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('completed', 'Completed'), ('refunded', 'Refunded'), ('failed', 'Failed')],
        default='pending'
    )
    transaction_id = models.CharField(max_length=100, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'status']), models.Index(fields=['transaction_id'])]

    def __str__(self):
        return f"Payment for Order {self.order.order_code}"

class DeviceToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=200)
    device_type = models.CharField(max_length=20, choices=[('ios', 'iOS'), ('android', 'Android')], default='android')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'token')
        indexes = [models.Index(fields=['user', 'token'])]

    def __str__(self):
        return f"Device Token for {self.user.username}"

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=20,
        choices=[
            ('order', 'Order Update'),
            ('promotion', 'Promotion'),
            ('product', 'Product Update'),
            ('system', 'System Notification')
        ],
        default='system'
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    related_order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    related_product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')

    class Meta:
        indexes = [models.Index(fields=['user', 'is_read']), models.Index(fields=['created_at'])]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} for {self.user.username}"

class Review(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews', limit_choices_to={'role': 'customer'})
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviews')
    rating = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['product', 'created_at'])]
        unique_together = ('user', 'product', 'order')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.rating} stars for {self.product.name} by {self.user.username}"

class ReviewReply(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='replies')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='review_replies', limit_choices_to={'role__in': ['distributor', 'admin']})
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['review', 'created_at'])]
        ordering = ['created_at']

    def __str__(self):
        return f"Reply to review {self.review.id} by {self.user.username}"