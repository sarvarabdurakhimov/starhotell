"""The live bot's webhook is set first, is never deleted by a server without a public address, and heals itself."""
import pytest

from apps.telegram_bot import views
from apps.telegram_bot.api import TelegramError
from apps.telegram_bot.models import BotConfig


class FakeTelegram:
    """Remembers the bot's webhook like Telegram does; can fail chosen methods."""
    webhook = ''
    calls = []
    fail = set()

    def __init__(self, token):
        pass

    def call(self, method, **kw):
        FakeTelegram.calls.append(method)
        if method in FakeTelegram.fail:
            raise TelegramError(f'{method} failed')
        if method == 'setWebhook':
            FakeTelegram.webhook = kw['url']
        elif method == 'deleteWebhook':
            FakeTelegram.webhook = ''
        elif method == 'getWebhookInfo':
            return {'url': FakeTelegram.webhook}
        return True


@pytest.fixture
def bot(hotel_factory, monkeypatch):
    hotel, _ = hotel_factory(name='Transport Hotel')
    FakeTelegram.webhook, FakeTelegram.calls, FakeTelegram.fail = '', [], set()
    monkeypatch.setattr(views, 'TelegramAPI', FakeTelegram)
    return BotConfig.objects.create(hotel=hotel, token='1:x', bot_username='live_bot')


@pytest.mark.django_db
def test_server_without_public_address_keeps_the_live_webhook(bot, settings):
    FakeTelegram.webhook = 'https://prod.example/api/v1/telegram/webhook/1/'
    settings.PUBLIC_API_URL = ''  # e.g. a developer saving the bot in a local panel
    assert views.configure_transport(bot) == 'remote'
    assert FakeTelegram.webhook == 'https://prod.example/api/v1/telegram/webhook/1/'
    assert 'deleteWebhook' not in FakeTelegram.calls


@pytest.mark.django_db
def test_webhook_is_set_even_if_the_menu_button_fails(bot, settings):
    settings.PUBLIC_API_URL = 'https://prod.example'
    FakeTelegram.fail = {'setChatMenuButton'}
    assert views.configure_transport(bot) == 'webhook'
    assert FakeTelegram.webhook == f'https://prod.example/api/v1/telegram/webhook/{bot.id}/'


@pytest.mark.django_db
def test_lost_webhook_is_restored_by_the_scheduled_check(bot, settings):
    settings.PUBLIC_API_URL = 'https://prod.example'
    FakeTelegram.webhook = ''  # deleted from somewhere: the bot stopped answering
    assert views.ensure_webhooks() == ['live_bot']
    assert FakeTelegram.webhook == f'https://prod.example/api/v1/telegram/webhook/{bot.id}/'
    FakeTelegram.calls.clear()
    assert views.ensure_webhooks() == []  # already right: nothing is changed
    assert 'setWebhook' not in FakeTelegram.calls


@pytest.mark.django_db
def test_no_public_address_means_no_webhook_check(bot, settings):
    settings.PUBLIC_API_URL = ''
    assert views.ensure_webhooks() == []
    assert FakeTelegram.calls == []
