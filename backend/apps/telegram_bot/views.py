"""Panel API for the hotel's Telegram bot, and the webhook Telegram calls."""
import json
import logging
import secrets


from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsHotelOwner
from .api import TelegramAPI, TelegramError
from .handlers import handle_update
from .models import BotConfig

logger = logging.getLogger(__name__)


def set_menu_button(bot: BotConfig, api: TelegramAPI = None):
    """The button left of the message box opens the Mini App when it has an https address."""
    from .webapp import webapp_url
    api = api or TelegramAPI(bot.token)
    url = webapp_url(bot)
    if url:
        api.call('setChatMenuButton', menu_button={'type': 'web_app', 'text': 'Bron', 'web_app': {'url': url}})
    else:
        api.call('setChatMenuButton', menu_button={'type': 'commands'})


def webhook_url(bot: BotConfig) -> str:
    return f'{settings.PUBLIC_API_URL}/api/v1/telegram/webhook/{bot.id}/' if settings.PUBLIC_API_URL else ''


def configure_transport(bot: BotConfig) -> str:
    """Webhook when the backend has a public https address, otherwise long polling.

    The webhook comes first: menu button and commands are extras and must never keep it from being set.
    A server without a public address (e.g. a developer's computer sharing the production token) leaves
    another server's webhook alone instead of deleting it, so it cannot silence the live bot.
    """
    api = TelegramAPI(bot.token)
    url = webhook_url(bot)
    if url:
        api.call('setWebhook', url=url, secret_token=bot.webhook_secret,
                 allowed_updates=['message', 'callback_query', 'pre_checkout_query'])
        mode = 'webhook'
    elif (api.call('getWebhookInfo') or {}).get('url'):
        logger.warning('@%s is served by another server\'s webhook; leaving it in place', bot.bot_username)
        mode = 'remote'
    else:
        api.call('deleteWebhook')
        mode = 'polling'
    try:
        set_menu_button(bot, api)
        api.call('setMyCommands', commands=[
            {'command': 'start', 'description': 'Menyu / Меню'},
            {'command': 'book', 'description': 'Xona bron qilish / Забронировать'},
            {'command': 'reviews', 'description': 'Sharhlar / Отзывы'},
        ])
    except TelegramError as exc:
        logger.warning('Menu / commands for @%s not set: %s', bot.bot_username, exc)
    return mode


def ensure_webhooks() -> list:
    """Re-point any active bot whose webhook is missing or wrong (e.g. deleted from elsewhere).

    Runs from the scheduled job, so a lost webhook heals itself within minutes. Returns what was fixed.
    """
    if not settings.PUBLIC_API_URL:
        return []
    fixed = []
    for bot in BotConfig.objects.filter(is_active=True).select_related('hotel'):
        try:
            current = (TelegramAPI(bot.token).call('getWebhookInfo') or {}).get('url', '')
            if current != webhook_url(bot):
                configure_transport(bot)
                fixed.append(bot.bot_username)
                logger.warning('Webhook of @%s was %r; set again', bot.bot_username, current)
        except (TelegramError, OSError) as exc:
            logger.warning('Webhook check for @%s failed: %s', bot.bot_username, exc)
    return fixed


def _mask(value: str) -> str:
    return f'••••{value[-4:]}' if value else ''


def _payload(bot: BotConfig):
    mode = 'webhook' if settings.PUBLIC_API_URL else 'polling'
    if not bot:
        return {'configured': False, 'mode': mode}
    return {
        'configured': True,
        'bot_username': bot.bot_username,
        'is_active': bot.is_active,
        'token_hint': _mask(bot.token),
        'payment_provider_name': bot.payment_provider_name,
        'payment_token_hint': _mask(bot.payment_provider_token),
        'payment_test_mode': ':TEST:' in bot.payment_provider_token,
        'payment_hours': bot.payment_hours,
        'notify_chat_id': bot.notify_chat_id,
        'mode': mode,
    }


class BotConfigView(APIView):
    """GET/PUT/DELETE /api/v1/telegram/hotels/{hotel_id}/bot/ (owner only)."""
    permission_classes = [IsHotelOwner]

    def get(self, request, hotel_id):
        from apps.hotels.models import Hotel
        hotel = get_object_or_404(Hotel, pk=hotel_id)
        return Response(_payload(BotConfig.objects.filter(hotel=hotel).first()))

    def put(self, request, hotel_id):
        from apps.hotels.models import Hotel
        hotel = get_object_or_404(Hotel, pk=hotel_id)
        bot = BotConfig.objects.filter(hotel=hotel).first()
        d = request.data
        errors = {}

        token = (d.get('token') or '').strip()
        if not bot and not token:
            errors['token'] = ['Bot tokenini kiriting.']
        username = bot.bot_username if bot else ''
        if token:
            try:
                username = TelegramAPI(token).call('getMe', _timeout=15).get('username', '')
            except TelegramError as exc:
                errors['token'] = [f"Token noto'g'ri yoki Telegram bilan aloqa yo'q ({exc})."]
            else:
                if BotConfig.objects.filter(bot_username=username).exclude(hotel=hotel).exists():
                    errors['token'] = ['Bu bot boshqa mehmonxonaga ulangan.']

        provider = (d.get('payment_provider_name') or '').strip().lower()
        if provider and provider not in ('click', 'payme'):
            errors['payment_provider_name'] = ['Click yoki Payme tanlang.']

        try:
            hours = int(d.get('payment_hours') or 2)
            if not 1 <= hours <= 72:
                raise ValueError
        except (TypeError, ValueError):
            errors['payment_hours'] = ["1 dan 72 soatgacha bo'lishi kerak."]
            hours = 2

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        if bot is None:
            bot = BotConfig(hotel=hotel)
        if token and token != bot.token:
            bot.token = token
            bot.last_update_id = 0
            bot.webhook_secret = secrets.token_urlsafe(24)
        bot.bot_username = username
        bot.is_active = bool(d.get('is_active', True))
        pay_token = (d.get('payment_provider_token') or '').strip()
        if pay_token:
            bot.payment_provider_token = pay_token
        if d.get('clear_payment_token'):
            bot.payment_provider_token = ''
        bot.payment_provider_name = provider
        bot.payment_hours = hours
        bot.notify_chat_id = str(d.get('notify_chat_id') or '').strip()
        bot.save()

        warning = None
        try:
            configure_transport(bot)
        except TelegramError as exc:
            warning = f"Telegram sozlamasi o'rnatilmadi: {exc}"
        return Response({**_payload(bot), 'warning': warning})

    def delete(self, request, hotel_id):
        bot = BotConfig.objects.filter(hotel_id=hotel_id).first()
        if bot:
            try:
                TelegramAPI(bot.token).call('deleteWebhook')
            except TelegramError:
                pass
            bot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookView(APIView):
    """POST /api/v1/telegram/webhook/{bot_id}/ (called by Telegram)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request, bot_id):
        bot = BotConfig.objects.filter(pk=bot_id, is_active=True).select_related('hotel').first()
        given = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
        if not bot or not secrets.compare_digest(given, bot.webhook_secret):
            return Response(status=status.HTTP_403_FORBIDDEN)
        try:
            update = request.data if isinstance(request.data, dict) else json.loads(request.body)
        except ValueError:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        handle_update(bot, update)
        return Response({'ok': True})
