from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import PaymentViewSet

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'products', views.ProductViewSet, basename='product')
router.register(r'carts', views.CartViewSet, basename='cart')
router.register(r'orders', views.OrderViewSet, basename='order')
router.register(r'payments', views.PaymentViewSet, basename='payment')
router.register(r'chat-messages', views.ChatMessageViewSet, basename='chat-message')
router.register(r'categories', views.CategoryViewSet, basename='category')
router.register(r'inventory', views.InventoryViewSet, basename='inventory')
router.register(r'discounts', views.DiscountViewSet, basename='discount')
router.register(r'notifications', views.NotificationViewSet, basename='notification')
router.register(r'reviews', views.ReviewViewSet, basename='review')
router.register(r'review-replies', views.ReviewReplyViewSet, basename='review-reply')

urlpatterns = [
    path('', include(router.urls)),
    path('ping/', views.ping_view, name='ping'),
    path('statistics/', views.system_statistics, name='system-statistics'),
    path('distributor-statistics/', views.distributor_revenue_statistics, name='distributor-statistics'),
    path('success/', PaymentViewSet.as_view({'get': 'handle_success'}), name='payment-success'),
    path('cancel/', PaymentViewSet.as_view({'get': 'handle_cancel'}), name='payment-cancel'),
]
