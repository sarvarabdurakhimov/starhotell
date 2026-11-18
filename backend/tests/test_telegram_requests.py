"""Lapsed Telegram requests free their room exactly once; returning guests are matched by phone."""
from datetime import date, timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.bookings.models import BookingSource, BookingStatus
from apps.bookings.services import create_booking
from apps.guests.models import Guest
from apps.telegram_bot import services as svc
from apps.telegram_bot.models import BotConfig, TelegramChat


@pytest.fixture
def unpaid_request(hotel_factory, room_setup):
    hotel, _ = hotel_factory(name='Bot Hotel')
    _, room = room_setup(hotel)
    bot = BotConfig.objects.create(hotel=hotel, token='x', bot_username='test_bot')
    chat = TelegramChat.objects.create(bot=bot, chat_id=42)
    guest = Guest.objects.create(hotel=hotel, first_name='Aziz', last_name='Karimov')
    booking = create_booking(
        hotel_id=hotel.id, room_id=room.id, guest_id=guest.id,
        check_in=date.today() + timedelta(days=3), check_out=date.today() + timedelta(days=5),
        num_adults=1, num_children=0, special_requests='', created_by=None,
        status=BookingStatus.PENDING, source=BookingSource.TELEGRAM, telegram_chat=chat,
    )
    booking.approved_at = timezone.now() - timedelta(hours=3)
    booking.payment_due_at = timezone.now() - timedelta(hours=1)  # time to pay is over
    booking.save()
    return hotel, booking


@pytest.mark.django_db
class TestExpiry:
    def test_runs_twice_but_cancels_and_notifies_once(self, unpaid_request, monkeypatch):
        _, booking = unpaid_request
        sent = []
        monkeypatch.setattr(svc, 'send', lambda bot, chat_id, text, *a, **kw: sent.append(text))
        assert svc.expire_stale() == 1
        assert svc.expire_stale() == 0  # e.g. the bot and the cron job both ran: nothing happens twice
        booking.refresh_from_db()
        assert booking.status == BookingStatus.CANCELLED
        assert len(sent) == 1

    def test_management_command_for_cron(self, unpaid_request, monkeypatch):
        _, booking = unpaid_request
        monkeypatch.setattr(svc, 'send', lambda *a, **kw: None)
        call_command('expire_telegram_requests')
        booking.refresh_from_db()
        assert booking.status == BookingStatus.CANCELLED


@pytest.mark.django_db
class TestFindGuestByPhone:
    def test_matches_any_formatting_and_prefers_latest(self, hotel_factory):
        hotel, _ = hotel_factory(name='Phone Hotel')
        Guest.objects.create(hotel=hotel, first_name='Old', last_name='Card', phone='998901234567')
        newest = Guest.objects.create(hotel=hotel, first_name='New', last_name='Card', phone='+998 90 123-45-67')
        Guest.objects.create(hotel=hotel, first_name='Other', last_name='Guest', phone='+998 90 765-43-21')
        assert svc.find_guest_by_phone(hotel.id, '+998901234567') == newest
        assert svc.find_guest_by_phone(hotel.id, '+998 99 000 00 00') is None
