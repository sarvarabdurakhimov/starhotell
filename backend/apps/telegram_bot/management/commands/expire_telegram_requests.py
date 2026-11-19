"""Cancel lapsed Telegram booking requests (unpaid in time / unanswered before arrival),
send guests their reminders (arrival, check-out, review),
and restore any bot webhook that went missing.

    python manage.py expire_telegram_requests

Run it every few minutes from a scheduler when the bot works by webhook and no
Celery beat is running, e.g. a Railway cron service with schedule "*/5 * * * *".
"""
from django.core.management.base import BaseCommand

from apps.telegram_bot.services import expire_stale, send_reminders


class Command(BaseCommand):
    help = 'Cancel Telegram booking requests whose payment time or arrival date has passed.'

    def handle(self, *args, **opts):
        from apps.telegram_bot.views import ensure_webhooks
        n = expire_stale()
        self.stdout.write(f'Expired requests: {n}')
        self.stdout.write(f'Reminders sent: {send_reminders()}')
        fixed = ensure_webhooks()  # a lost webhook (bot not answering) is restored on the next run
        if fixed:
            self.stdout.write(f"Webhooks restored: {', '.join('@' + u for u in fixed)}")
