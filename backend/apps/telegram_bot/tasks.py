"""Scheduled jobs of the Telegram bot (Celery beat runs them; see CELERY_BEAT_SCHEDULE)."""
from celery import shared_task


@shared_task
def expire_telegram_requests() -> int:
    from .services import expire_stale
    return expire_stale()
