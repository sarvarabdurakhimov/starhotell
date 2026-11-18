"""Cancel lapsed Telegram booking requests (unpaid in time / unanswered before arrival).

    python manage.py expire_telegram_requests

Run it every few minutes from a scheduler when the bot works by webhook and no
Celery beat is running, e.g. a Railway cron service with schedule "*/5 * * * *".
"""
from django.core.management.base import BaseCommand

from apps.telegram_bot.services import expire_stale


class Command(BaseCommand):
    help = 'Cancel Telegram booking requests whose payment time or arrival date has passed.'

    def handle(self, *args, **opts):
        n = expire_stale()
        self.stdout.write(f'Expired requests: {n}')
