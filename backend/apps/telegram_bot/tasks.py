"""Scheduled jobs of the Telegram bot (Celery beat runs them; see CELERY_BEAT_SCHEDULE)."""
from celery import shared_task


@shared_task
def expire_telegram_requests() -> int:
    from .services import expire_stale, send_reminders
    from .views import ensure_webhooks
    count = expire_stale()
    send_reminders()  # arrival / check-out / review reminders to Telegram guests
    ensure_webhooks()  # a lost webhook (bot not answering) is restored within minutes
    return count
