import logging

from django.http import HttpResponseForbidden, HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.deprecation import MiddlewareMixin


logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(MiddlewareMixin):
    """Middleware ghi log thông tin mỗi request và response."""

    def process_request(self, request: HttpRequest) -> None:
        user = request.user.username if request.user.is_authenticated else 'Anonymous'
        logger.info(f"Request: {request.method} {request.path} User: {user}")

    def process_response(self, request: HttpRequest, response: HttpResponse) -> HttpResponse:
        logger.info(f"Response: {request.method} {request.path} Status: {response.status_code}")
        return response


class RoleBasedAccessMiddleware(MiddlewareMixin):
    """Middleware giới hạn truy cập khu vực admin theo vai trò người dùng."""

    def process_view(self, request: HttpRequest, view_func, view_args, view_kwargs) -> HttpResponse | None:
        if not request.path.startswith('/admin/'):
            return None

        admin_login_url = reverse('admin:login')
        admin_logout_url = reverse('admin:logout')

        if request.path in [admin_login_url, admin_logout_url]:
            return None

        if not request.user.is_authenticated:
            return redirect(admin_login_url)

        if not getattr(request.user, 'is_superuser', False):  # Hoặc dùng .role == 'admin' nếu có CustomUser
            return HttpResponseForbidden("Chỉ quản trị viên mới có quyền truy cập khu vực này.")

        return None
