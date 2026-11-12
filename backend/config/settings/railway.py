"""Railway.app settings: same as Render (no Redis, whitenoise for static files), plus Railway's hostname.

The server is always on, so Telegram bots run through a webhook on this service's public https address.
"""
import os

from .render import *  # noqa: F401, F403
from .render import ALLOWED_HOSTS, PUBLIC_API_URL

# Railway sets this to the service's public hostname (xxx.up.railway.app) once a domain is generated
RAILWAY_HOST = os.environ.get('RAILWAY_PUBLIC_DOMAIN', '')
if RAILWAY_HOST:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, RAILWAY_HOST]
    # Telegram webhooks need the public https address; default to Railway's own domain
    PUBLIC_API_URL = PUBLIC_API_URL or f'https://{RAILWAY_HOST}'

# Railway's health checks come from this internal host
ALLOWED_HOSTS = [*ALLOWED_HOSTS, 'healthcheck.railway.app']
