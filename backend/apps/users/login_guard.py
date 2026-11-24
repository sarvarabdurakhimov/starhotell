"""Limits password guessing against one account, whichever IP address the attempts come from.

The IP-based throttles can be dodged by sending a fresh X-Forwarded-For on every request, so the
login also counts failed passwords per email. The counter lives in the shared cache (all workers
see it) and is cleared by a successful login.
"""
import hashlib

from django.conf import settings
from django.core.cache import cache


def _limits():
    return (getattr(settings, 'LOGIN_MAX_FAILURES', 10), getattr(settings, 'LOGIN_FAILURE_WINDOW', 15 * 60))


def _key(email: str) -> str:
    return 'login-fail:' + hashlib.sha256(email.strip().lower().encode()).hexdigest()


def is_locked(email: str) -> bool:
    max_failures, _ = _limits()
    return bool(email) and (cache.get(_key(email)) or 0) >= max_failures


def record_failure(email: str) -> None:
    if not email:
        return
    _, window = _limits()
    key = _key(email)
    if cache.add(key, 1, window):
        return
    try:
        cache.incr(key)
    except ValueError:  # expired between add() and incr()
        cache.set(key, 1, window)


def reset(email: str) -> None:
    if email:
        cache.delete(_key(email))
