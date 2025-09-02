from django.contrib import admin
from django.urls import path
from django.template.response import TemplateResponse
from django.db.models import Count, Sum, Avg
from oauth2_provider.models import Application
from .models import User, Product, Cart, CartItem, Order, OrderItem, Payment, DeviceToken, Category, Inventory, Discount, Notification, Review, ReviewReply
from firebase_admin import db
from django.conf import settings
import pyrebase

# Khởi tạo Firebase
firebase = pyrebase.initialize_app(settings.FIREBASE_CONFIG)

class PharmaTechAdminSite(admin.AdminSite):
    site_header = "PharmaTech Administration"
    site_title = "PharmaTech Admin"
    index_title = "Welcome to PharmaTech Admin Portal"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('system-stats/', self.admin_view(self.system_stats), name='system-stats'),
        ]
        return custom_urls + urls

    def system_stats(self, request):
        # Thống kê sản phẩm theo danh mục
        product_stats = Product.objects.values('category__name').annotate(product_count=Count('id')).order_by('-product_count')
        # Thống kê đơn hàng theo trạng thái
        order_stats = Order.objects.values('status').annotate(order_count=Count('id')).order_by('-order_count')
        # Tổng doanh thu
        revenue_stats = Payment.objects.filter(status='completed').aggregate(total_revenue=Sum('amount'))['total_revenue'] or 0
        # Tổng số tương tác (từ Firebase, đồng bộ với views.py)
        conversations_ref = db.reference('chat_messages')
        conversations = conversations_ref.get() or {}
        total_interactions = sum(len(msgs) for msgs in conversations.values()) if conversations else 0
        # Danh mục bán chạy
        trending_categories = OrderItem.objects.values('product__category__name').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
        # Sản phẩm bán chạy
        trending_products = OrderItem.objects.values('product__name').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
        # Thống kê bổ sung
        valid_discount_count = Discount.objects.filter(is_active=True).count()
        review_count = Review.objects.count()
        avg_rating = Review.objects.aggregate(avg_rating=Avg('rating'))['avg_rating'] or 0
        unread_notification_count = Notification.objects.filter(is_read=False).count()

        return TemplateResponse(request, 'admin/system_stats.html', {
            'product_stats': product_stats,
            'order_stats': order_stats,
            'total_revenue': revenue_stats,
            'total_interactions': total_interactions,
            'trending_categories': trending_categories,
            'trending_products': trending_products,
            'valid_discount_count': valid_discount_count,
            'review_count': review_count,
            'avg_rating': avg_rating,
            'unread_notification_count': unread_notification_count,
        })

# Tùy chỉnh giao diện quản trị cho Application
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('name', 'client_id', 'client_type', 'authorization_grant_type')
    search_fields = ('name', 'client_id')
    list_filter = ('client_type', 'authorization_grant_type')

# Tùy chỉnh giao diện quản trị cho User
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'full_name', 'is_active', 'created_at')
    list_filter = ('role', 'is_active')
    search_fields = ('username', 'email', 'full_name', 'phone')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho Product
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'distributor', 'category', 'price', 'total_stock', 'is_approved', 'created_at')
    list_filter = ('is_approved', 'category', 'distributor')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho Inventory
class InventoryAdmin(admin.ModelAdmin):
    list_display = ('product', 'distributor', 'quantity', 'last_updated')
    list_filter = ('distributor',)
    search_fields = ('product__name',)
    readonly_fields = ('last_updated',)

# Tùy chỉnh giao diện quản trị cho Cart
class CartAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at', 'updated_at')
    list_filter = ('user',)
    search_fields = ('user__username',)
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho CartItem
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('cart', 'product', 'quantity')
    list_filter = ('cart__user',)
    search_fields = ('product__name',)

# Tùy chỉnh giao diện quản trị cho Order
class OrderAdmin(admin.ModelAdmin):
    list_display = ('order_code', 'user', 'total_amount', 'discount_amount', 'status', 'created_at')
    list_filter = ('status', 'user')
    search_fields = ('order_code', 'user__username')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho OrderItem
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'product', 'quantity', 'price')
    list_filter = ('order__user',)
    search_fields = ('product__name', 'order__order_code')

# Tùy chỉnh giao diện quản trị cho Payment
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('order', 'user', 'amount', 'payment_method', 'status', 'paid_at')
    list_filter = ('status', 'payment_method')
    search_fields = ('order__order_code', 'user__username')
    readonly_fields = ('created_at', 'paid_at', 'refunded_at')

# Tùy chỉnh giao diện quản trị cho DeviceToken
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'token', 'device_type', 'created_at')
    list_filter = ('device_type',)
    search_fields = ('user__username', 'token')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho Category
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name', 'description')

# Tùy chỉnh giao diện quản trị cho Discount
class DiscountAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount_type', 'discount_value', 'is_active', 'start_date', 'end_date', 'uses_count')
    list_filter = ('is_active', 'discount_type')
    search_fields = ('code', 'description')
    readonly_fields = ('created_at', 'updated_at', 'uses_count')

# Tùy chỉnh giao diện quản trị cho Notification
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'notification_type', 'is_read', 'created_at')
    list_filter = ('is_read', 'notification_type')
    search_fields = ('title', 'message', 'user__username')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho Review
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'rating', 'comment', 'created_at')
    list_filter = ('rating', 'product')
    search_fields = ('comment', 'user__username', 'product__name')
    readonly_fields = ('created_at', 'updated_at')

# Tùy chỉnh giao diện quản trị cho ReviewReply
class ReviewReplyAdmin(admin.ModelAdmin):
    list_display = ('review', 'user', 'comment', 'created_at')
    list_filter = ('review__product', 'user')
    search_fields = ('comment', 'user__username')
    readonly_fields = ('created_at', 'updated_at')

# Khởi tạo Admin Site
admin_site = PharmaTechAdminSite(name='pharmatech_admin')

# Đăng ký các mô hình
admin_site.register(User, UserAdmin)
admin_site.register(Product, ProductAdmin)
admin_site.register(Inventory, InventoryAdmin)
admin_site.register(Cart, CartAdmin)
admin_site.register(CartItem, CartItemAdmin)
admin_site.register(Order, OrderAdmin)
admin_site.register(OrderItem, OrderItemAdmin)
admin_site.register(Payment, PaymentAdmin)
admin_site.register(DeviceToken, DeviceTokenAdmin)
admin_site.register(Category, CategoryAdmin)
admin_site.register(Discount, DiscountAdmin)
admin_site.register(Notification, NotificationAdmin)
admin_site.register(Review, ReviewAdmin)
admin_site.register(ReviewReply, ReviewReplyAdmin)
admin_site.register(Application, ApplicationAdmin)