"""A staying guest's services in the bot: order notes, stock, cleaning / repair requests, the bill,
reminders, and the returning-guest discount."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services import create_booking
from apps.hotels.models import HotelSettings
from apps.memberships.models import HotelRole
from apps.payments.models import Payment
from apps.room_service.models import GuestRequest, RequestStatus, ServiceOrder
from apps.room_service.services import bill, create_order
from apps.telegram_bot import services as bot_svc
from apps.telegram_bot.models import SentReminder
from tests.test_room_service import (  # noqa: F401  (fixtures)
    GUEST_ID, ChatAPI, buttons, chat_bot, check_in, hotel_with_guest,
)


def to_guest(ctx):
    return [text for chat, text in ctx['sent'] if chat == str(GUEST_ID)]


def to_staff(ctx):
    return [text for chat, text in ctx['sent'] if chat == '-100']


@pytest.mark.django_db
class TestHubAndNote:
    def test_hub_offers_everything(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        text, markup = chat_bot(ctx, text='🛎 Xizmatlar')
        assert '101-xona' in text and {'rso', 'rqc', 'rqr', 'rsbh'} <= set(buttons(markup))
        text, _ = chat_bot(ctx, text='🛎 Xonaga buyurtma')  # an old keyboard still works
        assert '101-xona' in text

    def test_note_goes_with_the_order(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        chat_bot(ctx, data=f"rs+:{ctx['water'].id}")
        chat_bot(ctx, data='rsn')
        text, markup = chat_bot(ctx, text='Choy shakarsiz, soat 8 da')
        assert 'Choy shakarsiz' in text and 'rsok' in buttons(markup)
        text, _ = chat_bot(ctx, data='rsok')
        order = ServiceOrder.objects.get()
        assert order.note == 'Choy shakarsiz, soat 8 da' and 'Choy shakarsiz' in text
        assert any('Choy shakarsiz' in x for x in to_staff(ctx))
        text, _ = chat_bot(ctx, text='/order')
        assert 'Izoh:' not in text  # the note is cleared with the cart


@pytest.mark.django_db
class TestStock:
    def test_orders_take_from_stock_and_warn_when_low(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        water = ctx['water']
        water.stock, water.low_stock = 3, 1
        water.save()
        chat = ctx['bot'].chats.get(chat_id=GUEST_ID)
        with pytest.raises(Exception):
            create_order(chat, [{'id': water.id, 'quantity': 4}])
        water.refresh_from_db()
        assert water.stock == 3  # nothing taken by a refused order

        order = create_order(chat, [{'id': water.id, 'quantity': 3}])
        water.refresh_from_db()
        assert water.stock == 0 and any('Ombor' in x and 'tugadi' in x for x in to_staff(ctx))
        text, markup = chat_bot(ctx, text='/order')
        assert f'rs+:{water.id}' not in buttons(markup)  # sold out: not offered

        chat_bot(ctx, data=f'rsx:{order.pk}')  # guest withdraws: the water goes back
        water.refresh_from_db()
        assert water.stock == 3

    def test_cart_cannot_exceed_what_is_left(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        ctx['water'].stock = 1
        ctx['water'].save()
        chat_bot(ctx, data=f"rs+:{ctx['water'].id}")
        text, markup = chat_bot(ctx, data=f"rs+:{ctx['water'].id}")
        assert 'Suv × 1' in text
        add = next(b for row in markup['inline_keyboard'] for b in row if b['text'].startswith('➕ Suv'))
        assert add['callback_data'] == 'noop'

    def test_panel_shows_stock(self, api_client, hotel_with_guest):
        ctx = hotel_with_guest
        api_client.force_authenticate(user=ctx['owner'])
        url = reverse('room_service:item', kwargs={'hotel_id': ctx['hotel'].id, 'pk': ctx['water'].id})
        res = api_client.patch(url, {'stock': 2, 'low_stock': 5}, format='json')
        assert res.status_code == 200 and res.data['is_low'] is True
        assert api_client.patch(url, {'stock': None}, format='json').data['is_low'] is False


@pytest.mark.django_db
class TestRequests:
    def test_cleaning_request_is_handled_and_guest_told(self, api_client, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        text, _ = chat_bot(ctx, data='rqc!')
        req = GuestRequest.objects.get()
        assert req.kind == 'cleaning' and f'#{req.pk}' in text
        assert any('Xonani tozalash' in x and '101-xona' in x for x in to_staff(ctx))

        api_client.force_authenticate(user=ctx['staff'][HotelRole.HOUSEKEEPING])
        base = {'hotel_id': ctx['hotel'].id}
        assert [r['id'] for r in api_client.get(reverse('room_service:requests', kwargs=base)).data] == [req.pk]
        url = reverse('room_service:request', kwargs={**base, 'pk': req.pk})
        for step in ('accepted', 'done'):
            assert api_client.patch(url, {'status': step}, format='json').status_code == 200
        assert any('qabul qilindi' in x for x in to_guest(ctx)) and any('bajarildi' in x for x in to_guest(ctx))
        assert api_client.patch(url, {'status': 'accepted'}, format='json').status_code == 400

    def test_repair_is_described_in_words(self, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        chat_bot(ctx, data='rqr')
        chat_bot(ctx, text='Konditsioner ishlamayapti')
        req = GuestRequest.objects.get()
        assert req.kind == 'repair' and req.text == 'Konditsioner ishlamayapti'

    def test_auditor_cannot_handle_requests(self, api_client, hotel_with_guest, chat_bot):
        ctx = hotel_with_guest
        check_in(ctx)
        chat_bot(ctx, data='rqc!')
        req = GuestRequest.objects.get()
        api_client.force_authenticate(user=ctx['staff'][HotelRole.AUDITOR])
        url = reverse('room_service:request', kwargs={'hotel_id': ctx['hotel'].id, 'pk': req.pk})
        assert api_client.patch(url, {'status': 'done'}, format='json').status_code == 403
        req.refresh_from_db()
        assert req.status == RequestStatus.NEW

    def test_request_needs_a_stay(self, hotel_with_guest, chat_bot):
        text, _ = chat_bot(hotel_with_guest, data='rqc!')
        assert 'joylashganingizdan keyin' in text and not GuestRequest.objects.exists()


class Recorder:
    """TelegramAPI stand-in for payment calls."""
    calls = []

    def __init__(self, token):
        pass

    def call(self, method, **kw):
        Recorder.calls.append((method, kw))
        return True


@pytest.mark.django_db
class TestBill:
    def _setup(self, ctx, monkeypatch):
        check_in(ctx)
        chat = ctx['bot'].chats.get(chat_id=GUEST_ID)
        create_order(chat, [{'id': ctx['water'].id, 'quantity': 2}])  # 10 000
        create_order(chat, [{'id': ctx['towel'].id}])  # free: not on the bill as a debt
        Recorder.calls = []
        monkeypatch.setattr(bot_svc, 'TelegramAPI', Recorder)
        return chat

    def test_bill_without_online_payment(self, hotel_with_guest, chat_bot, monkeypatch):
        ctx = hotel_with_guest
        self._setup(ctx, monkeypatch)
        stay = ctx['booking']
        stay.refresh_from_db()
        text, markup = chat_bot(ctx, data='rsbh')
        due = stay.total_amount + 10000
        assert bill(stay)['due'] == due
        assert "qabulxonada" in text and 'rsbp' not in buttons(markup)

    def test_bill_paid_in_telegram(self, hotel_with_guest, chat_bot, monkeypatch):
        ctx = hotel_with_guest
        chat = self._setup(ctx, monkeypatch)
        bot = ctx['bot']
        bot.payment_provider_token, bot.payment_provider_name = '1:TEST:x', 'click'
        bot.save()
        stay = Booking.objects.get(pk=ctx['booking'].pk)
        _, markup = chat_bot(ctx, data='rsbh')
        assert 'rsbp' in buttons(markup)
        chat_bot(ctx, data='rsbp')
        method, invoice = Recorder.calls[-1]
        due = bill(stay)['due']
        assert method == 'sendInvoice' and invoice['payload'] == f'bill:{stay.id}:{int(due)}'

        def pre_checkout(total):
            bot_svc.handle_pre_checkout(bot, {'id': 'p', 'invoice_payload': invoice['payload'],
                                              'currency': 'UZS', 'total_amount': total})
            return Recorder.calls[-1][1]['ok']
        assert pre_checkout(int(due) * 100) is True
        assert pre_checkout(int(due) * 100 - 100) is False

        sp = {'invoice_payload': invoice['payload'], 'currency': 'UZS', 'total_amount': int(due) * 100,
              'provider_payment_charge_id': 'ch-1', 'telegram_payment_charge_id': 'tg-1'}
        bot_svc.handle_successful_payment(bot, chat, sp)
        bot_svc.handle_successful_payment(bot, chat, sp)  # Telegram may resend: recorded once
        assert Payment.objects.filter(booking=stay).count() == 1
        assert bill(stay)['due'] == 0 and all(o.is_paid for o in ServiceOrder.objects.filter(total__gt=0))
        assert pre_checkout(int(due) * 100) is False  # nothing is owed any more
        assert any("To'lov qabul qilindi" in x for x in to_guest(ctx))


@pytest.mark.django_db
class TestReminders:
    def _now(self, ctx, hour):
        today = bot_svc.hotel_today(ctx['bot'])
        return today, datetime.combine(today, time(hour), tzinfo=ZoneInfo(ctx['hotel'].timezone))

    def test_arrival_reminder_once(self, hotel_with_guest):
        ctx = hotel_with_guest
        today, now = self._now(ctx, 10)
        Booking.objects.filter(pk=ctx['booking'].pk).update(check_in=today + timedelta(days=1),
                                                            check_out=today + timedelta(days=3))
        assert bot_svc.send_reminders(now) == 1
        assert bot_svc.send_reminders(now) == 0
        assert any('Ertaga sizni kutamiz' in x and ctx['booking'].reference in x for x in to_guest(ctx))

    def test_checkout_reminder_in_the_morning_only(self, hotel_with_guest):
        ctx = hotel_with_guest
        today, night = self._now(ctx, 5)
        Booking.objects.filter(pk=ctx['booking'].pk).update(status=BookingStatus.CHECKED_IN, check_out=today)
        assert bot_svc.send_reminders(night) == 0
        assert bot_svc.send_reminders(night.replace(hour=9)) == 1
        assert any('chiqish kuni' in x for x in to_guest(ctx))

    def test_review_asked_again_a_day_after_leaving(self, hotel_with_guest):
        ctx = hotel_with_guest
        _, now = self._now(ctx, 12)
        Booking.objects.filter(pk=ctx['booking'].pk).update(status=BookingStatus.CHECKED_OUT,
                                                            actual_check_out=now - timedelta(days=2))
        assert bot_svc.send_reminders(now) == 1
        assert SentReminder.objects.filter(kind='review').count() == 1


@pytest.mark.django_db
class TestLoyalty:
    def test_returning_guest_gets_the_discount(self, hotel_with_guest, room_setup):
        ctx = hotel_with_guest
        b = ctx['booking']
        s = HotelSettings.objects.get(hotel=ctx['hotel'])
        s.loyalty_min_stays, s.loyalty_discount_percent = 1, Decimal('10')
        s.save()
        start = timezone.localdate() + timedelta(days=30)

        def book():
            return create_booking(hotel_id=ctx['hotel'].id, room_id=b.room_id, guest_id=b.guest_id,
                                  check_in=start, check_out=start + timedelta(days=2), num_adults=1,
                                  num_children=0, special_requests='', created_by=ctx['owner'])
        first = book()  # no finished stay yet: full price
        assert first.discount_amount == 0
        first.delete()
        Booking.objects.filter(pk=b.pk).update(status=BookingStatus.CHECKED_OUT)
        again = book()
        full = again.rate_per_night * 2
        assert again.discount_amount == full / 10 and again.total_amount == full - full / 10

        chat = ctx['bot'].chats.get(chat_id=GUEST_ID)
        chat.guest_id = b.guest_id
        chat.save()
        assert '−10%' in bot_svc.stay_price_text(chat, full)

    def test_off_by_default(self, hotel_with_guest):
        ctx = hotel_with_guest
        Booking.objects.filter(pk=ctx['booking'].pk).update(status=BookingStatus.CHECKED_OUT)
        chat = ctx['bot'].chats.get(chat_id=GUEST_ID)
        chat.guest_id = ctx['booking'].guest_id
        chat.save()
        assert bot_svc.chat_loyalty_percent(chat) == 0
