"""Telegram Mini App API: Telegram-signed access, availability, booking, and the guest's own bookings."""
import hashlib
import hmac
import json
import time
from datetime import date, timedelta
from urllib.parse import urlencode

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.bookings.models import BookingStatus
from apps.guests.models import Guest
from apps.telegram_bot import services as svc
from apps.telegram_bot import webapp
from apps.telegram_bot.models import BotConfig, TelegramChat

TOKEN = '123456:TEST-token'


def init_data(user_id=777, token=TOKEN, auth_date=None, **user):
    """initData exactly as Telegram builds and signs it."""
    fields = {
        'auth_date': str(int(auth_date if auth_date is not None else time.time())),
        'query_id': 'AAE',
        'user': json.dumps({'id': user_id, 'first_name': 'Aziz', 'language_code': 'uz', **user}),
    }
    check = '\n'.join(f'{k}={v}' for k, v in sorted(fields.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    fields['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


@pytest.fixture
def setup(hotel_factory, room_setup, monkeypatch):
    hotel, _ = hotel_factory(name='Mini Hotel')
    room_type, room = room_setup(hotel)
    bot = BotConfig.objects.create(hotel=hotel, token=TOKEN, bot_username='mini_bot')
    sent = []
    monkeypatch.setattr(svc, 'send', lambda b, chat_id, text, *a, **kw: sent.append((chat_id, text)))
    return hotel, room_type, room, bot, sent


def url(name, bot, **kw):
    return reverse(f'telegram_bot:{name}', kwargs={'bot_id': bot.id, **kw})


def stay(days_from_now=5, nights=2, guests=2):
    ci = date.today() + timedelta(days=days_from_now)
    return {'check_in': ci.isoformat(), 'check_out': (ci + timedelta(days=nights)).isoformat(), 'guests': guests}


def auth(api_client, **kw):
    api_client.credentials(HTTP_X_TELEGRAM_INIT_DATA=init_data(**kw))
    return api_client


@pytest.mark.django_db
class TestAccess:
    def test_unsigned_or_forged_data_is_refused(self, api_client, setup):
        *_, bot, _ = setup
        assert api_client.get(url('webapp_info', bot)).status_code in (401, 403)
        api_client.credentials(HTTP_X_TELEGRAM_INIT_DATA=init_data(token='999:other-bot'))
        assert api_client.get(url('webapp_info', bot)).status_code in (401, 403)
        forged = init_data().replace('Aziz', 'Hacker')  # data changed after signing
        api_client.credentials(HTTP_X_TELEGRAM_INIT_DATA=forged)
        assert api_client.get(url('webapp_info', bot)).status_code in (401, 403)

    def test_old_data_must_be_reopened(self, api_client, setup):
        *_, bot, _ = setup
        auth(api_client, auth_date=time.time() - 2 * 24 * 3600)
        assert api_client.get(url('webapp_info', bot)).status_code in (401, 403)

    def test_info_lists_rooms_in_som_and_creates_the_guest_chat(self, api_client, setup):
        hotel, room_type, _, bot, _ = setup
        res = auth(api_client).get(url('webapp_info', bot))
        assert res.status_code == 200
        assert res.data['hotel']['currency'] == 'UZS'
        assert res.data['room_types'][0]['price_per_night'] == 150
        assert TelegramChat.objects.filter(bot=bot, chat_id=777).exists()


@pytest.mark.django_db
class TestBooking:
    def test_availability_then_book_then_withdraw(self, api_client, setup):
        _, room_type, _, bot, sent = setup
        auth(api_client)
        free = api_client.get(url('webapp_availability', bot), stay())
        assert free.status_code == 200
        assert free.data['room_types'][0]['total'] == 300  # 150 × 2 nights

        res = api_client.post(url('webapp_book', bot), {
            **stay(), 'room_type_id': room_type.id, 'first_name': 'Aziz', 'last_name': 'Karimov',
            'phone': '+998 90 123-45-67'}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['can_withdraw'] is True
        chat = TelegramChat.objects.get(bot=bot, chat_id=777)
        assert (chat.first_name, chat.last_name, chat.phone) == ('Aziz', 'Karimov', '+998901234567')
        assert any(res.data['reference'] in text for _, text in sent)  # confirmation also in the chat

        # The room is now held: nothing free for the same dates, and a second request is refused
        assert api_client.get(url('webapp_availability', bot), stay()).data['room_types'] == []
        again = api_client.post(url('webapp_book', bot), {
            **stay(days_from_now=20), 'room_type_id': room_type.id, 'first_name': 'Aziz',
            'last_name': 'Karimov', 'phone': '+998901234567'}, format='json')
        assert again.status_code == 409

        mine = api_client.get(url('webapp_bookings', bot)).data
        assert [b['reference'] for b in mine] == [res.data['reference']]
        cancel = api_client.post(url('webapp_booking_action', bot, pk=res.data['id'], action='cancel'))
        assert cancel.status_code == 200
        assert cancel.data['status'] == BookingStatus.CANCELLED

    def test_another_guests_booking_is_not_reachable(self, api_client, setup):
        _, room_type, _, bot, _ = setup
        auth(api_client, user_id=1)
        res = api_client.post(url('webapp_book', bot), {
            **stay(), 'room_type_id': room_type.id, 'first_name': 'A', 'last_name': 'B',
            'phone': '+998901111111'}, format='json')
        auth(api_client, user_id=2)
        assert api_client.post(url('webapp_booking_action', bot, pk=res.data['id'], action='cancel')).status_code == 404
        assert api_client.get(url('webapp_bookings', bot)).data == []

    @pytest.mark.parametrize('bad', [
        {'days_from_now': -1}, {'nights': 0}, {'nights': 31}, {'guests': 3},
    ])
    def test_invalid_stays_are_rejected(self, api_client, setup, bad):
        _, room_type, _, bot, _ = setup
        res = auth(api_client).post(url('webapp_book', bot), {
            **stay(**bad), 'room_type_id': room_type.id, 'first_name': 'A', 'last_name': 'B',
            'phone': '+998901111111'}, format='json')
        assert res.status_code == 400

    def test_blacklisted_guest_cannot_book(self, api_client, setup):
        hotel, room_type, _, bot, _ = setup
        Guest.objects.create(hotel=hotel, first_name='X', last_name='Y', phone='+998902222222', is_blacklisted=True)
        res = auth(api_client).post(url('webapp_book', bot), {
            **stay(), 'room_type_id': room_type.id, 'first_name': 'X', 'last_name': 'Y',
            'phone': '+998902222222'}, format='json')
        assert res.status_code == 403


def test_app_button_needs_an_https_address():
    bot = BotConfig(id=5)
    with override_settings(TELEGRAM_WEBAPP_URL='', FRONTEND_URL='http://localhost:3000'):
        assert webapp.webapp_url(bot) == ''
    with override_settings(TELEGRAM_WEBAPP_URL='https://starhotel.vercel.app/'):
        assert webapp.webapp_url(bot) == 'https://starhotel.vercel.app/tg/5'


@pytest.mark.django_db
class TestManagerPanel:
    """A Mini App booking reaches the manager panel, and the manager can approve, check in and check out."""

    def test_mini_app_booking_is_approved_checked_in_and_out_from_the_panel(self, api_client, user_factory, setup):
        from rest_framework.test import APIClient
        from apps.memberships.models import HotelMembership, HotelRole

        hotel, room_type, _, bot, sent = setup
        res = auth(api_client).post(url('webapp_book', bot), {
            **stay(), 'room_type_id': room_type.id, 'first_name': 'Aziz', 'last_name': 'Karimov',
            'phone': '+998901234567'}, format='json')
        assert res.status_code == 201, res.data
        pk, ref = res.data['id'], res.data['reference']

        manager = user_factory(email='manager@example.com')
        HotelMembership.objects.create(hotel=hotel, user=manager, role=HotelRole.MANAGER, is_active=True)
        panel = APIClient()
        panel.force_authenticate(manager)

        def detail(name):
            return reverse(f'bookings:{name}', kwargs={'hotel_id': hotel.id, 'pk': pk})

        listed = panel.get(reverse('bookings:list_create', kwargs={'hotel_id': hotel.id}), {'page_size': 100})
        assert listed.status_code == 200, listed.data
        rows = listed.data['results'] if isinstance(listed.data, dict) else listed.data
        row = next(b for b in rows if b['reference'] == ref)
        assert (row['source'], row['status']) == ('telegram', BookingStatus.PENDING)

        approved = panel.post(detail('approve'))
        assert approved.status_code == 200, approved.data
        assert approved.data['status'] == BookingStatus.CONFIRMED  # no online payment set up
        assert panel.post(detail('check_in')).data['status'] == BookingStatus.CHECKED_IN
        assert panel.post(detail('check_out')).data['status'] == BookingStatus.CHECKED_OUT
