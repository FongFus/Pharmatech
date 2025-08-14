from rest_framework import permissions

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

class IsChatMessageSender(permissions.BasePermission):
    """Chỉ cho phép người gửi tin nhắn chỉnh sửa/xóa tin nhắn."""
    def has_object_permission(self, request, view, obj):
        return obj.user == request.user