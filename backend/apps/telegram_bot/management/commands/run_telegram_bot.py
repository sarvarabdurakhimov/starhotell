"""Long-polling runner for local development (no public https address needed).

    python manage.py run_telegram_bot
"""
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.telegram_bot.api import TelegramAPI, TelegramError
from apps.telegram_bot.handlers import handle_update
from apps.telegram_bot.models import BotConfig
from apps.telegram_bot.services import expire_stale
from apps.telegram_bot.views import set_menu_button

ALLOWED = ['message', 'callback_query', 'pre_checkout_query']


class Command(BaseCommand):
    help = 'Run all active hotel Telegram bots with long polling.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Take the bot over even if a server webhook is set (the server stops getting messages).')

    def handle(self, *args, **opts):
        # A webhook means a deployed server (e.g. Railway) is serving this bot. Polling here would remove it.
        if not opts['force']:
            for bot in BotConfig.objects.filter(is_active=True):
                try:
                    url = (TelegramAPI(bot.token).call('getWebhookInfo') or {}).get('url')
                except TelegramError:
                    url = ''
                if url:
                    self.stderr.write(
                        f'@{bot.bot_username} is served by a server webhook ({url.split("/api/")[0]}).\n'
                        'Not starting local polling, so the server keeps working. Use --force to take it over.'
                    )
                    return
        self.stdout.write('Telegram bots: long polling started (Ctrl+C to stop)', ending='\n')
        cleared = set()
        while True:
            close_old_connections()
            bots = list(BotConfig.objects.filter(is_active=True).select_related('hotel'))
            if not bots:
                time.sleep(5)
                continue
            expire_stale()
            # One bot: hold each request open longer. Several: poll each briefly in turn.
            wait = 25 if len(bots) == 1 else 2
            for bot in bots:
                api = TelegramAPI(bot.token)
                try:
                    if bot.token not in cleared:
                        api.call('deleteWebhook')  # getUpdates does not work while a webhook is set
                        set_menu_button(bot, api)
                        cleared.add(bot.token)
                    updates = api.call('getUpdates', _timeout=wait + 15, timeout=wait,
                                       offset=bot.last_update_id + 1, allowed_updates=ALLOWED)
                except TelegramError as exc:
                    self.stderr.write(f'@{bot.bot_username}: {exc}')
                    time.sleep(3)
                    continue
                for update in updates or []:
                    handle_update(bot, update)
                    bot.last_update_id = update['update_id']
                    BotConfig.objects.filter(pk=bot.pk).update(last_update_id=bot.last_update_id)
