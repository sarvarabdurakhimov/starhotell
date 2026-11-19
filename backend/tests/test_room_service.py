"""Room service: a checked-in guest orders from the Mini App; staff handle it in the panel."""
from datetime import date, timedelta

import pytest
from django.urls import reverse

from apps.bookings.models import BookingSource, BookingStatus
from apps.bookings.services import create_booking, transition_booking
from apps.guests.models import Guest
from apps.memberships.models import HotelMembership, HotelRole
from apps.room_service.models import OrderStatus, ServiceItem, ServiceOrder
from apps.telegram_bot import services as bot_svc
from apps.telegram_bot.models import BotConfig, TelegramChat
from tests.test_telegram_webapp import TOKEN, init_data

GUEST_ID = 777


@pytest.fixture
def hotel_with_guest(hotel_factory, room_setup, user_factory, monkeypatch):
    """A hotel, its menu, a Telegram guest with a booking (not yet checked in), and staff of each role."""
    hotel, owner = hotel_factory(name='Service Hotel')
    _, room = room_setup(hotel)
    bot = BotConfig.objects.create(hotel=hotel, token=TOKEN, bot_username='service_bot', notify_chat_id='-100')
    chat = TelegramChat.objects.create(bot=bot, chat_id=GUEST_ID, language='uz')
    guest = Guest.objects.create(hotel=hotel, first_name='Aziz', last_name='Karimov')
    booking = create_booking(
        hotel_id=hotel.id, room_id=room.id, guest_id=guest.id, check_in=date.today(),
        check_out=date.today() + timedelta(days=2), num_adults=1, num_children=0, special_requests='',
        created_by=owner, source=BookingSource.TELEGRAM, telegram_chat=chat,
    )
    water = ServiceItem.objects.create(hotel=hotel, name='Suv', category='drink', price=5000)
    towel = ServiceItem.objects.create(hotel=hotel, name='Sochiq', category='linen', price=0)
    hidden = ServiceItem.objects.create(hotel=hotel, name='Eski', price=1, is_active=False)
    staff = {}
    for role in (HotelRole.RECEPTIONIST, HotelRole.HOUSEKEEPING, HotelRole.AUDITOR):
        user = user_factory(email=f'{role}@service.test')
        HotelMembership.objects.create(hotel=hotel, user=user, role=role, is_active=True)
        staff[role] = user
    sent = []
    monkeypatch.setattr(bot_svc, 'send', lambda b, chat_id, text, *a, **kw: sent.append((str(chat_id), text)))
    return {'hotel': hotel, 'owner': owner, 'bot': bot, 'booking': booking, 'water': water, 'towel': towel,
            'hidden': hidden, 'staff': staff, 'sent': sent}


def check_in(ctx):
    transition_booking(ctx['booking'], BookingStatus.CHECKED_IN, ctx['owner'])


def guest(api_client, user_id=GUEST_ID):
    api_client.credentials(HTTP_X_TELEGRAM_INIT_DATA=init_data(user_id=user_id))
    return api_client


def wurl(name, ctx, **kw):
    return reverse(f'telegram_bot:{name}', kwargs={'bot_id': ctx['bot'].id, **kw})


def purl(name, ctx, **kw):
    return reverse(f'room_service:{name}', kwargs={'hotel_id': ctx['hotel'].id, **kw})


@pytest.mark.django_db
class TestGuestOrders:
    def test_menu_opens_only_after_check_in(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        guest(api_client)
        before = api_client.get(wurl('webapp_services', ctx)).data
        assert before['stay'] is None and before['items'] == []
        refused = api_client.post(wurl('webapp_order', ctx), {'items': [{'id': ctx['water'].id}]}, format='json')
        assert refused.status_code == 400

        check_in(ctx)
        data = api_client.get(wurl('webapp_services', ctx)).data
        assert data['stay']['room_number'] == '101'
        assert {i['name'] for i in data['items']} == {'Suv', 'Sochiq'}  # inactive items hidden

    def test_order_totals_notifies_staff_and_guest_can_withdraw(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        check_in(ctx)
        res = guest(api_client).post(wurl('webapp_order', ctx), {
            'items': [{'id': ctx['water'].id, 'quantity': 3}, {'id': ctx['towel'].id, 'quantity': 2}],
            'note': 'Iltimos tezroq'}, format='json')
        assert res.status_code == 201, res.data
        assert res.data['total'] == 15000  # 3 × 5 000 + 2 free towels
        order = ServiceOrder.objects.get(pk=res.data['id'])
        assert order.room.room_number == '101' and order.status == OrderStatus.NEW
        assert any('Yangi buyurtma' in text and '101-xona' in text for chat, text in ctx['sent'] if chat == '-100')

        cancelled = api_client.post(wurl('webapp_order_cancel', ctx, pk=order.id))
        assert cancelled.status_code == 200 and cancelled.data['status'] == OrderStatus.CANCELLED

    @pytest.mark.parametrize('items', [
        [], [{'id': 0}], [{'quantity': 21}], 'nonsense',
    ])
    def test_bad_carts_are_rejected(self, api_client, hotel_with_guest, items):
        ctx = hotel_with_guest
        check_in(ctx)
        if isinstance(items, list):
            items = [{**{'id': ctx['water'].id}, **row} for row in items]
        res = guest(api_client).post(wurl('webapp_order', ctx), {'items': items}, format='json')
        assert res.status_code == 400

    def test_inactive_item_cannot_be_ordered(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        check_in(ctx)
        res = guest(api_client).post(wurl('webapp_order', ctx), {'items': [{'id': ctx['hidden'].id}]}, format='json')
        assert res.status_code == 400

    def test_other_guests_cannot_touch_the_order(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        check_in(ctx)
        order_id = guest(api_client).post(
            wurl('webapp_order', ctx), {'items': [{'id': ctx['water'].id}]}, format='json').data['id']
        stranger = guest(api_client, user_id=888)
        assert stranger.post(wurl('webapp_order_cancel', ctx, pk=order_id)).status_code == 404
        assert stranger.get(wurl('webapp_services', ctx)).data['stay'] is None


@pytest.mark.django_db
class TestStaffHandling:
    def _order(self, api_client, ctx):
        check_in(ctx)
        return guest(api_client).post(wurl('webapp_order', ctx), {'items': [{'id': ctx['water'].id}]},
                                      format='json').data['id']

    def test_housekeeping_delivers_and_guest_is_told(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        order_id = self._order(api_client, ctx)
        api_client.credentials()
        api_client.force_authenticate(user=ctx['staff'][HotelRole.HOUSEKEEPING])
        assert [o['id'] for o in api_client.get(purl('orders', ctx)).data] == [order_id]
        for step in (OrderStatus.ACCEPTED, OrderStatus.DELIVERED):
            res = api_client.patch(purl('order', ctx, pk=order_id), {'status': step}, format='json')
            assert res.status_code == 200 and res.data['status'] == step
        to_guest = [text for chat, text in ctx['sent'] if chat == str(GUEST_ID)]
        assert any('qabul qilindi' in x for x in to_guest) and any('yetkazildi' in x for x in to_guest)
        # Delivered is final; a guest can no longer withdraw it either
        assert api_client.patch(purl('order', ctx, pk=order_id), {'status': 'cancelled'},
                                format='json').status_code == 400

    def test_auditor_can_look_but_not_handle(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        order_id = self._order(api_client, ctx)
        api_client.credentials()
        api_client.force_authenticate(user=ctx['staff'][HotelRole.AUDITOR])
        assert api_client.get(purl('orders', ctx)).status_code == 200
        assert api_client.patch(purl('order', ctx, pk=order_id), {'status': 'accepted'},
                                format='json').status_code == 403

    def test_menu_is_edited_by_owner_only(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        api_client.force_authenticate(user=ctx['staff'][HotelRole.RECEPTIONIST])
        assert api_client.post(purl('items', ctx), {'name': 'Meva', 'price': 30000}).status_code == 403
        api_client.force_authenticate(user=ctx['owner'])
        res = api_client.post(purl('items', ctx), {'name': 'Meva', 'category': 'fruit', 'price': 30000})
        assert res.status_code == 201
        assert api_client.post(purl('items', ctx), {'name': 'meva', 'price': 1}).status_code == 400  # duplicate
        assert api_client.post(purl('items', ctx), {'name': 'Narxsiz', 'price': -5}).status_code == 400

    def test_default_menu_is_added_once(self, api_client, hotel_factory):
        hotel, owner = hotel_factory(name='Empty Hotel')
        api_client.force_authenticate(user=owner)
        url = reverse('room_service:items_defaults', kwargs={'hotel_id': hotel.id})
        assert api_client.post(url).status_code == 201
        names = set(ServiceItem.objects.filter(hotel=hotel).values_list('name', flat=True))
        assert {'Sochiq', "Ko'rpa", "Ko'rpacha", 'Yostiq', 'Osh'} <= names
        assert api_client.post(url).status_code == 400


class ChatAPI:
    """Stands in for TelegramAPI inside the bot handlers: remembers what the bot shows the guest."""
    shown = []

    def __init__(self, token):
        pass

    def call(self, method, **kw):
        if method in ('sendMessage', 'editMessageText'):
            ChatAPI.shown.append((kw['text'], kw.get('reply_markup')))
            return {'message_id': len(ChatAPI.shown)}
        return True

    def delete_messages(self, chat_id, ids):
        pass


@pytest.fixture
def chat_bot(monkeypatch):
    from apps.telegram_bot import handlers
    ChatAPI.shown = []
    monkeypatch.setattr(handlers, 'TelegramAPI', ChatAPI)

    def press(ctx, text=None, data=None):
        from apps.telegram_bot.handlers import handle_update
        who = {'id': GUEST_ID, 'first_name': 'Aziz'}
        if data:
            update = {'callback_query': {'id': 'q', 'from': who, 'data': data,
                                         'message': {'chat': {'id': GUEST_ID}, 'message_id': 9}}}
        else:
            update = {'message': {'chat': {'id': GUEST_ID, 'type': 'private'}, 'from': who,
                                  'text': text, 'message_id': 1}}
        handle_update(ctx['bot'], update)
        return ChatAPI.shown[-1]
    return press


def buttons(markup):
    return {b['callback_data']: b['text'] for row in (markup or {}).get('inline_keyboard', []) for b in row}


@pytest.mark.django_db
class TestOrderInChat:
    """Ordering straight in the bot chat: works without the Mini App (no https needed)."""

    def test_menu_button_needs_a_stay(self, hotel_with_guest, chat_bot):
        text, markup = chat_bot(hotel_with_guest, text="🛎 Xonaga buyurtma")
        assert 'joylashganingizdan keyin' in text and markup is None

    def test_guest_fills_cart_orders_and_withdraws(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        water, towel = ctx['water'].id, ctx['towel'].id
        text, markup = chat_bot(ctx, text='/order')
        assert '101-xona' in text and f'rs+:{ctx["hidden"].id}' not in buttons(markup)
        assert 'bepul' in buttons(markup)[f'rs+:{towel}']
        chat_bot(ctx, data=f'rs+:{water}')
        chat_bot(ctx, data=f'rs+:{water}')
        chat_bot(ctx, data=f'rs+:{towel}')
        text, markup = chat_bot(ctx, data=f'rs-:{towel}')
        assert 'Suv × 2' in text and 'Sochiq ×' not in text and '10 000' in text and 'rsok' in buttons(markup)

        text, markup = chat_bot(ctx, data='rsok')
        order = ServiceOrder.objects.get()
        assert [(li.name, li.quantity) for li in order.lines.all()] == [('Suv', 2)] and order.total == 10000
        assert f'#{order.pk}' in text and any('Yangi buyurtma' in x for chat, x in ctx['sent'] if chat == '-100')
        text, _ = chat_bot(ctx, text='/order')
        assert "Savat hozircha bo'sh" in text  # the cart is emptied once the order is sent

        text, _ = chat_bot(ctx, data=f'rsx:{order.pk}')
        order.refresh_from_db()
        assert order.status == OrderStatus.CANCELLED and 'bekor qilindi' in text

    def test_order_after_check_out_is_refused(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        chat_bot(ctx, data=f'rs+:{ctx["water"].id}')
        transition_booking(ctx['booking'], BookingStatus.CHECKED_OUT, ctx['owner'])
        text, _ = chat_bot(ctx, data='rsok')
        assert 'yuborilmadi' in text and not ServiceOrder.objects.exists()


@pytest.mark.django_db
def test_check_in_offers_chat_ordering_without_the_mini_app(api_client, hotel_with_guest, settings):
    ctx = hotel_with_guest
    sent_markup = []
    bot_svc.send = (lambda b, chat_id, text, *a, **kw: sent_markup.append((str(chat_id), text, kw)))
    settings.TELEGRAM_WEBAPP_URL = ''
    api_client.force_authenticate(user=ctx['staff'][HotelRole.RECEPTIONIST])
    url = reverse('bookings:check_in', kwargs={'hotel_id': ctx['hotel'].id, 'pk': ctx['booking'].id})
    assert api_client.post(url).status_code == 200
    _, text, kw = next(m for m in sent_markup if m[0] == str(GUEST_ID))
    assert kw['reply_markup']['inline_keyboard'][0][0]['callback_data'] == 'rs'


@pytest.mark.django_db
def test_check_in_offers_room_service_in_the_bot(api_client, hotel_with_guest, settings):
    ctx = hotel_with_guest
    sent_markup = []
    bot_svc.send = (lambda b, chat_id, text, *a, **kw: sent_markup.append((str(chat_id), text, kw)))
    settings.TELEGRAM_WEBAPP_URL = 'https://hotel.example'
    api_client.force_authenticate(user=ctx['staff'][HotelRole.RECEPTIONIST])
    url = reverse('bookings:check_in', kwargs={'hotel_id': ctx['hotel'].id, 'pk': ctx['booking'].id})
    assert api_client.post(url).status_code == 200
    chat_id, text, kw = next(m for m in sent_markup if m[0] == str(GUEST_ID))
    assert '101-xona' in text
    button = kw['reply_markup']['inline_keyboard'][0][0]
    assert button['web_app']['url'] == f"https://hotel.example/tg/{ctx['bot'].id}?tab=services"
