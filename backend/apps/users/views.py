"""Authentication and user management API views."""
import logging
from datetime import datetime, timezone

from django.conf import settings
from rest_framework import status, generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import AuthenticationFailed, Throttled
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from . import login_guard
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)

logger = logging.getLogger(__name__)


def _set_auth_cookies(response: Response, refresh: RefreshToken) -> None:
    """Set access and refresh token cookies with security settings from config."""
    jwt_settings = settings.SIMPLE_JWT
    secure = jwt_settings.get('AUTH_COOKIE_SECURE', True)
    httponly = jwt_settings.get('AUTH_COOKIE_HTTP_ONLY', True)
    samesite = jwt_settings.get('AUTH_COOKIE_SAMESITE', 'Lax')
    access_lifetime = jwt_settings.get('ACCESS_TOKEN_LIFETIME')
    refresh_lifetime = jwt_settings.get('REFRESH_TOKEN_LIFETIME')

    response.set_cookie(
        key=jwt_settings.get('AUTH_COOKIE', 'hms_access'),
        value=str(refresh.access_token),
        max_age=int(access_lifetime.total_seconds()),
        secure=secure,
        httponly=httponly,
        samesite=samesite,
    )
    response.set_cookie(
        key=jwt_settings.get('AUTH_COOKIE_REFRESH', 'hms_refresh'),
        value=str(refresh),
        max_age=int(refresh_lifetime.total_seconds()),
        secure=secure,
        httponly=httponly,
        samesite=samesite,
    )


class RegisterView(generics.CreateAPIView):
    """POST /api/v1/auth/register/"""
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'auth'

    def create(self, request: Request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        logger.info('New user registered: %s', user.email)
        return Response(
            {'detail': 'Account created successfully. Please verify your email.'},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """POST /api/v1/auth/login/"""
    permission_classes = [AllowAny]
    throttle_scope = 'auth'

    def post(self, request: Request):
        email = str(request.data.get('email') or '')
        if login_guard.is_locked(email):
            raise Throttled(detail="Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring.")
        serializer = LoginSerializer(data=request.data, context={'request': request})
        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            login_guard.record_failure(email)
            raise
        login_guard.reset(email)
        user: User = serializer.validated_data['user']

        # Update last login IP
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
        user.last_login_ip = ip.split(',')[0].strip() if ip else None
        user.save(update_fields=['last_login_ip'])

        refresh = RefreshToken.for_user(user)
        response = Response({
            'user': UserProfileSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })
        _set_auth_cookies(response, refresh)
        logger.info('User logged in: %s', user.email)
        return response


class LogoutView(APIView):
    """POST /api/v1/auth/logout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request: Request):
        jwt_settings = settings.SIMPLE_JWT
        refresh_cookie = jwt_settings.get('AUTH_COOKIE_REFRESH', 'hms_refresh')
        raw_refresh = request.COOKIES.get(refresh_cookie) or request.data.get('refresh')

        if raw_refresh:
            try:
                token = RefreshToken(raw_refresh)
                token.blacklist()
            except TokenError:
                pass  # Token already invalid — still clear cookies

        response = Response({'detail': 'Logged out successfully.'})
        response.delete_cookie(jwt_settings.get('AUTH_COOKIE', 'hms_access'))
        response.delete_cookie(refresh_cookie)
        return response


class TokenRefreshView(APIView):
    """POST /api/v1/auth/refresh/"""
    permission_classes = [AllowAny]

    def post(self, request: Request):
        jwt_settings = settings.SIMPLE_JWT
        refresh_cookie = jwt_settings.get('AUTH_COOKIE_REFRESH', 'hms_refresh')
        raw_refresh = request.COOKIES.get(refresh_cookie) or request.data.get('refresh')

        if not raw_refresh:
            return Response({'detail': 'Refresh token not found.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(raw_refresh)
            response = Response({
                'detail': 'Token refreshed.',
                'access': str(refresh.access_token),
            })
            _set_auth_cookies(response, refresh)
            return response
        except TokenError as e:
            return Response({'detail': str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/me/"""
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def retrieve(self, request: Request, *args, **kwargs):
        data = self.get_serializer(request.user).data
        # The frontend picks the panel (owner/manager) from these membership roles.
        data['memberships'] = [
            {'hotel_id': m.hotel_id, 'hotel_name': m.hotel.name, 'role': m.role}
            for m in request.user.hotel_memberships.filter(is_active=True).select_related('hotel')
        ]
        return Response(data)


class ChangePasswordView(APIView):
    """POST /api/v1/auth/change-password/"""
    permission_classes = [IsAuthenticated]

    def post(self, request: Request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        logger.info('Password changed for user: %s', request.user.email)
        return Response({'detail': 'Password updated successfully.'})
