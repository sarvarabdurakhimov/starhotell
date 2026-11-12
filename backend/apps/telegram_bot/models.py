"""Per-hotel Telegram booking bot: configuration and per-chat conversation state."""
import secrets

from django.db import models

from apps.common.models import TimestampedModel


def _secret() -> str:
    return secrets.token_urlsafe(24)


class BotConfig(TimestampedModel):
    """One bot per hotel. The owner pastes the BotFather token in the panel."""
    hotel = models.OneToOneField('hotels.Hotel', on_delete=models.CASCADE, related_name='telegram_bot')
    token = models.CharField(max_length=100)
    bot_username = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)

    # Telegram Payments provider token (BotFather → Payments → Click / Payme)
    payment_provider_token = models.CharField(max_length=200, blank=True)
    payment_provider_name = models.CharField(max_length=20, blank=True)  # click / payme
    # Click and Payme charge in UZS. If the hotel prices in another currency, 1 unit = this many so'm.
    uzs_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    payment_hours = models.PositiveSmallIntegerField(default=2)  # time to pay after approval

    # Optional chat (e.g. a managers' group) that gets a message about each new request
    notify_chat_id = models.CharField(max_length=32, blank=True)

    webhook_secret = models.CharField(max_length=64, default=_secret)
    last_update_id = models.BigIntegerField(default=0)  # long-polling offset

    def __str__(self) -> str:
        return f'@{self.bot_username or "?"} ({self.hotel.name})'


class TelegramChat(TimestampedModel):
    """A guest talking to a hotel's bot, with where they are in the booking dialog."""
    bot = models.ForeignKey(BotConfig, on_delete=models.CASCADE, related_name='chats')
    chat_id = models.BigIntegerField()
    username = models.CharField(max_length=64, blank=True)
    language = models.CharField(max_length=2, default='uz')  # uz / ru
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    guest = models.ForeignKey('guests.Guest', on_delete=models.SET_NULL, null=True, blank=True, related_name='telegram_chats')

    state = models.CharField(max_length=30, blank=True)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = [('bot', 'chat_id')]

    def __str__(self) -> str:
        return f'{self.chat_id} @{self.username}'
