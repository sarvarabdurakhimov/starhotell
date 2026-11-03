"""Development settings."""
from .base import *  # noqa: F401, F403

DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ['*']

# Use less secure cookie settings for local HTTP development
SIMPLE_JWT['AUTH_COOKIE_SECURE'] = False  # noqa: F405
SIMPLE_JWT['AUTH_COOKIE_SAMESITE'] = 'Lax'  # noqa: F405

CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False

# Email: print to console in development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Disable throttling in development
REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []  # noqa: F405
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {}  # noqa: F405

# Verbose SQL logging in dev
LOGGING['loggers']['django.db.backends']['level'] = 'DEBUG'  # noqa: F405
