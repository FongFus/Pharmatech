from django.contrib import admin
from django.shortcuts import render
from django.urls import path
from django.template.response import TemplateResponse
from .models import User, Product, Cart, CartItem, Order, OrderItem, Payment, DeviceToken, Category
from django.db.models import Count, Sum
from oauth2_provider.models import Application


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
        product_stats = Product.objects.values('category').annotate(product_count=Count('id')).order_by('-product_count')
        # Thống kê đơn hàng theo trạng thái
        order_stats = Order.objects.values('status').annotate(order_count=Count('id')).order_by('-order_count')
        # Tổng doanh thu
        revenue_stats = Payment.objects.filter(status='completed').aggregate(total_revenue=Sum('amount'))['total_revenue'] or 0
        # Tổng số tương tác
        total_interactions = ChatMessage.objects.count()
        # Danh mục bán chạy (dựa trên số lượng bán trong OrderItem)
        trending_categories = OrderItem.objects.values('product__category').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]
        # Sản phẩm bán chạy
        trending_products = OrderItem.objects.values('product__name').annotate(total_sold=Sum('quantity')).order_by('-total_sold')[:5]

        return TemplateResponse(request, 'admin/system_stats.html', {
            'product_stats': product_stats,
            'order_stats': order_stats,
            'total_revenue': revenue_stats,
            'total_interactions': total_interactions,
            'trending_categories': trending_categories,
            'trending_products': trending_products,
        })

# Tùy chỉnh giao diện quản trị cho Application
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('name', 'client_id', 'client_type', 'authorization_grant_type')
    search_fields = ('name', 'client_id')
    list_filter = ('client_type', 'authorization_grant_type')

admin_site = PharmaTechAdminSite(name='pharmatech_admin')

# Đăng ký các mô hình hiện có
admin_site.register(User)
admin_site.register(Product)
admin_site.register(Cart)
admin_site.register(CartItem)
admin_site.register(Order)
admin_site.register(OrderItem)
admin_site.register(Payment)
admin_site.register(DeviceToken)
admin_site.register(Category)

# Đăng ký mô hình Application của oauth2_provider
admin_site.register(Application, ApplicationAdmin)