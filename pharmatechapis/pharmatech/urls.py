"""
URL configuration for pharmatech project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from core.admin import admin_site
from core.authentication import CustomOAuth2Authentication
from oauth2_provider.contrib.rest_framework import OAuth2Authentication

schema_view = get_schema_view(
    openapi.Info(
        title="PharmaTech E-Commerce API",
        default_version='v1',
        description="API for PharmaTech E-Commerce Platform, supporting user management, products, carts, orders, payments, notifications, reviews, and chatbot integration.",
        contact=openapi.Contact(email="support@pharmatech.com"),
        license=openapi.License(name="PharmaTech License © 2025"),
    ),
    public=True,  # Ensure schema generation bypasses authentication
    permission_classes=(permissions.AllowAny,),
    authentication_classes=(OAuth2Authentication, CustomOAuth2Authentication),  # Support both authentication classes
)

urlpatterns = [
    path('', include('core.urls')),  # API endpoints with version prefix
    path('admin/', admin_site.urls),  # Custom admin site
    path('o/', include('oauth2_provider.urls', namespace='oauth2_provider')),  # OAuth2 endpoints
    path('swagger<format>.json|.yaml', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]