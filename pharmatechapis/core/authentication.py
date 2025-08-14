from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from oauth2_provider.contrib.rest_framework import OAuth2Authentication
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()

class EmailOrUsernameModelBackend(ModelBackend):
    """
    Custom authentication backend allowing login with email or username.
    Checks user role and active status.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)

        try:
            user = User.objects.get(email=username)
        except User.DoesNotExist:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                return None

        if user.check_password(password) and self.user_can_authenticate(user):
            if user.role not in ['customer', 'distributor', 'admin']:
                raise AuthenticationFailed('Invalid user role.')
            if not user.is_active:
                raise AuthenticationFailed('User account is deactivated.')
            return user
        return None

class CustomOAuth2Authentication(OAuth2Authentication):
    """
    Custom OAuth2 authentication to validate role and active status.
    """
    def authenticate(self, request):
        user_auth_tuple = super().authenticate(request)
        if user_auth_tuple is None:
            return None
        
        user, token = user_auth_tuple
        if user.role not in ['customer', 'distributor', 'admin']:
            raise AuthenticationFailed('Invalid user role.')
        if not user.is_active:
            raise AuthenticationFailed('User account is deactivated.')
        return user_auth_tuple