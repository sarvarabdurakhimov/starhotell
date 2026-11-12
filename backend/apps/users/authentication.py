"""Cookie-based JWT authentication backend."""
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.conf import settings


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that reads the access token from an HttpOnly cookie
    or falls back to Authorization header. This protects browser clients from XSS token theft
    while supporting header auth for automated tests and external clients.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        cookie_name = settings.SIMPLE_JWT.get('AUTH_COOKIE', 'hms_access')
        raw_token = request.COOKIES.get(cookie_name)
        if raw_token is None:
            return None
        # A stale cookie (expired, or its user was deleted) counts as "not logged in".
        # Raising here would block even the login request that replaces the cookie;
        # protected views still answer 401 through their permission checks.
        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except (TokenError, AuthenticationFailed):
            return None
