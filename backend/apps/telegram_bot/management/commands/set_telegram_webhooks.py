"""Point every active hotel bot at this server's webhook. Runs on each deploy, before the web server starts.

    python manage.py set_telegram_webhooks

Does nothing without PUBLIC_API_URL, and never fails the deploy: a bad token is only logged.
"""
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.telegram_bot.api import TelegramError
from apps.telegram_bot.models import BotConfig
from apps.telegram_bot.views import configure_transport


class Command(BaseCommand):
    help = 'Set Telegram webhooks for all active bots to PUBLIC_API_URL.'

    def handle(self, *args, **opts):
        if not settings.PUBLIC_API_URL:
            self.stdout.write('PUBLIC_API_URL is not set: skipping Telegram webhooks.')
            return
        for bot in BotConfig.objects.filter(is_active=True).select_related('hotel'):
            try:
                configure_transport(bot)
                self.stdout.write(f'Telegram webhook set: @{bot.bot_username} -> {settings.PUBLIC_API_URL}')
            except (TelegramError, OSError) as exc:
                self.stderr.write(f'Telegram webhook failed for @{bot.bot_username}: {exc}')
