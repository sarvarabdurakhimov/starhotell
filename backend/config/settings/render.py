"""Render.com settings: production security, but no Redis (free tier).

Cache is in-memory, sessions live in the database, Celery tasks run inline.
"""
import os

from .production import *  # noqa: F401, F403
from .production import ALLOWED_HOSTS, MIDDLEWARE

# Render sets this to the service's public hostname (xxx.onrender.com)
RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_HOST:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, RENDER_HOST]

# Serve admin / Swagger static files without a separate web server
MIDDLEWARE = [
    MIDDLEWARE[0],
    'whitenoise.middleware.WhiteNoiseMiddleware',
    *MIDDLEWARE[1:],
]
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
SESSION_ENGINE = 'django.contrib.sessions.backends.db'

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False

# Render already forces HTTPS at its edge; a redirect here would break health checks
SECURE_SSL_REDIRECT = False
