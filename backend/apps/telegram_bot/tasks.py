"""Scheduled jobs of the Telegram bot (Celery beat runs them; see CELERY_BEAT_SCHEDULE)."""
from celery import shared_task


@shared_task
def expire_telegram_requests() -> int:
    from .services import expire_stale
    from .views import ensure_webhooks
    count = expire_stale()
    ensure_webhooks()  # a lost webhook (bot not answering) is restored within minutes
    return count
