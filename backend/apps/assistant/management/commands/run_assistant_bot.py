"""The owner's Claude assistant on Telegram (long polling, separate from the hotels' guest bots).

    python manage.py run_assistant_bot

Needs in backend/.env:
    ASSISTANT_BOT_TOKEN=<token of a new bot from @BotFather>
    ANTHROPIC_API_KEY=<key from platform.claude.com>
    ASSISTANT_ALLOWED_CHAT_IDS=<your Telegram id; send /id to the bot to see it>
"""
import os
import time

from django.core.management.base import BaseCommand, CommandError

from apps.assistant import services
from apps.telegram_bot.api import TelegramAPI, TelegramError

HELP = (
    "Salom! Men StarHotel loyihasi bo'yicha Claude yordamchisiman.\n"
    "Bergan vazifalaringiz va loyihada nima o'zgargani haqida so'rang, masalan:\n"
    "- \"So'mga o'tishda nimalar o'zgardi?\"\n"
    "- \"Qaysi ishlar hali GitHub'ga push qilinmagan?\"\n\n"
    "Buyruqlar:\n"
    "/vazifalar - barcha vazifalar ro'yxati\n"
    "/ozgarishlar 4 - 4-vazifada nima o'zgargani\n"
    "/holat - hozirgi holat (nima qilinmagan)\n"
    "/yangi - suhbatni yangidan boshlash\n"
    "/id - Telegram ID'ingiz"
)


class Command(BaseCommand):
    help = "Run the owner's Claude assistant Telegram bot (long polling)."

    def handle(self, *args, **opts):
        token = os.environ.get('ASSISTANT_BOT_TOKEN', '').strip()
        if not token:
            raise CommandError('ASSISTANT_BOT_TOKEN is not set (backend/.env). Create a bot with @BotFather.')
        self.api = TelegramAPI(token)
        try:
            me = self.api.call('getMe', _timeout=15)
            # Polling needs no webhook; this bot is never served by the server
            self.api.call('deleteWebhook')
        except TelegramError as exc:
            raise CommandError(f'Telegram rejected the token: {exc}')
        self.assistant = services.Assistant()
        allowed = services.allowed_chat_ids()
        self.stdout.write(f"@{me.get('username')}: assistant started (allowed ids: {sorted(allowed) or 'none yet'})")

        offset = 0
        while True:
            try:
                updates = self.api.call('getUpdates', _timeout=40, timeout=25, offset=offset,
                                        allowed_updates=['message'])
            except TelegramError as exc:
                self.stderr.write(f'getUpdates: {exc}')
                time.sleep(3)
                continue
            for update in updates or []:
                offset = update['update_id'] + 1
                try:
                    self.on_message(update.get('message') or {})
                except Exception as exc:  # one bad update must not stop the bot
                    self.stderr.write(f'update {update.get("update_id")}: {exc!r}')

    def reply(self, chat_id, text):
        for part in services.split_message(text):
            self.api.call('sendMessage', chat_id=chat_id, text=part)

    def on_message(self, msg):
        chat = msg.get('chat') or {}
        text = (msg.get('text') or '').strip()
        if chat.get('type') != 'private' or not text:
            return
        chat_id = chat['id']
        command = text.split()[0].split('@')[0].lower() if text.startswith('/') else ''

        if command == '/id':
            return self.reply(chat_id, f'Sizning Telegram ID: {chat_id}')
        # Re-read on every message, so editing .env and restarting is enough
        allowed = services.allowed_chat_ids()
        if chat_id not in allowed:
            hint = ("\n\nAgar bu bot sizniki bo'lsa, backend/.env fayliga quyidagini yozing va botni qayta ishga "
                    f"tushiring:\nASSISTANT_ALLOWED_CHAT_IDS={chat_id}") if not allowed else ''
            return self.reply(chat_id, f"Kechirasiz, bu bot shaxsiy. Sizning ID: {chat_id}.{hint}")

        knowledge = services.load_knowledge()
        if command in ('/start', '/help'):
            return self.reply(chat_id, HELP)
        if command == '/yangi':
            self.assistant.reset(chat_id)
            return self.reply(chat_id, 'Suhbat yangidan boshlandi.')
        if command == '/vazifalar':
            return self.reply(chat_id, 'Bergan vazifalaringiz:\n\n' + services.task_list(knowledge))
        if command == '/holat':
            return self.reply(chat_id, services.section(knowledge, 'Holat') or "Holat bo'limi yo'q.")
        if command == '/ozgarishlar':
            arg = text.split(maxsplit=1)[1].strip() if len(text.split(maxsplit=1)) > 1 else ''
            if not arg.isdigit():
                return self.reply(chat_id, "Vazifa raqamini yozing, masalan: /ozgarishlar 4\n\n"
                                           + services.task_list(knowledge))
            return self.reply(chat_id, services.section(knowledge, f'{arg}-vazifa')
                              or f"{arg}-vazifa tarixda topilmadi.")
        if command:
            return self.reply(chat_id, "Bunday buyruq yo'q. /help ni bosing.")

        try:
            self.api.call('sendChatAction', chat_id=chat_id, action='typing')
        except TelegramError:
            pass
        self.reply(chat_id, self.assistant.ask(chat_id, text))
