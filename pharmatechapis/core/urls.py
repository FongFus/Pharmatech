from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'products', views.ProductViewSet, basename='product')
router.register(r'carts', views.CartViewSet, basename='cart')
router.register(r'orders', views.OrderViewSet, basename='order')
router.register(r'payments', views.PaymentViewSet, basename='payment')
router.register(r'chat-messages', views.ChatMessageViewSet, basename='chat-message')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/', include('oauth2_provider.urls', namespace='oauth2_provider')),
    path('fcm-token/', views.save_fcm_token, name='save-fcm-token'),
    path('ping/', views.ping_view, name='ping'),
    path('vnpay/create_payment_url/', views.create_payment_url, name='create-payment-url'),
    path('vnpay/redirect/', views.vnpay_redirect, name='vnpay-redirect'),
    path('statistics/', views.system_statistics, name='system-statistics'),
    path('chat-messages/realtime-messages/<str:conversation_id>/', views.ChatMessageViewSet.as_view({'get': 'get_realtime_messages'}), name='realtime-messages'),
]