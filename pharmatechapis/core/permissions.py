from rest_framework import permissions
from .models import User, Product, Order, Payment, Category, Inventory

class IsCustomer(permissions.BasePermission):
    """Chỉ cho phép người dùng có vai trò 'customer' thực hiện hành động."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'

class IsDistributor(permissions.BasePermission):
    """Chỉ cho phép người dùng có vai trò 'distributor' thực hiện hành động."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'distributor'

class IsAdmin(permissions.BasePermission):
    """Chỉ cho phép người dùng có vai trò 'admin' thực hiện hành động."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'

class IsCartOwner(permissions.BasePermission):
    """Chỉ cho phép chủ sở hữu giỏ hàng thực hiện hành động trên giỏ hàng."""
    def has_object_permission(self, request, view, obj):
        return obj.user == request.user

class IsOrderOwner(permissions.BasePermission):
    """Chỉ cho phép chủ sở hữu đơn hàng thực hiện hành động trên đơn hàng."""
    def has_object_permission(self, request, view, obj):
        return obj.user == request.user

class IsProductOwner(permissions.BasePermission):
    """Chỉ cho phép nhà phân phối sở hữu sản phẩm thực hiện hành động trên sản phẩm."""
    def has_object_permission(self, request, view, obj):
        return obj.distributor == request.user

class IsInventoryManager(permissions.BasePermission):
    """Chỉ cho phép nhà phân phối quản lý kho hàng của họ."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'distributor'

    def has_object_permission(self, request, view, obj):
        return obj.distributor == request.user

class IsCategoryManager(permissions.BasePermission):
    """Chỉ cho phép quản trị viên quản lý danh mục sản phẩm."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'

class IsPaymentManager(permissions.BasePermission):
    """Chỉ cho phép quản trị viên quản lý thanh toán."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'

class IsConversationViewer(permissions.BasePermission):
    """Chỉ cho phép người dùng xem lịch sử hội thoại của họ."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'

    def has_object_permission(self, request, view, obj):
        return obj.user == request.user