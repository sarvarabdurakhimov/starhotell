"""
Telegram booking lifecycle.

  guest asks in the bot ──► Booking PENDING (source=telegram, holds a room)
  manager approves     ──► approved_at set; with payments on: invoice sent, payment_due_at = now + payment_hours
                            without payments set up: CONFIRMED straight away
  guest pays (Click/Payme via Telegram Payments) ──► Payment SUCCEEDED + CONFIRMED
  manager rejects / time to pay runs out ──► CANCELLED, guest is told
"""
import html
import logging
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.bookings.models import Booking, BookingSource, BookingStatus
from apps.bookings.services import create_booking, transition_booking
from apps.common.money import som
from apps.rooms.models import Room, RoomStatus, RoomType

from .api import TelegramAPI, TelegramError
from .models import BotConfig, TelegramChat
from .texts import t

logger = logging.getLogger(__name__)

MAX_NIGHTS = 30
ACTIVE = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]


# ── formatting ──────────────────────────────────────────────────────────────

def fmt_date(d: date) -> str:
    return d.strftime('%d.%m.%Y')


def uzs_amount(bot: BotConfig, amount: Decimal) -> int:
    """Amount in whole so'm (all prices are in so'm)."""
    return int(Decimal(amount).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def price_text(bot: BotConfig, amount: Decimal) -> str:
    return som(amount)


def local_dt(bot: BotConfig, dt) -> str:
    try:
        tz = ZoneInfo(bot.hotel.timezone)
    except Exception:
        tz = None
    return timezone.localtime(dt, tz).strftime('%d.%m.%Y %H:%M')


def hotel_today(bot: BotConfig) -> date:
    try:
        return timezone.localtime(timezone.now(), ZoneInfo(bot.hotel.timezone)).date()
    except Exception:
        return timezone.localdate()


def payments_enabled(bot: BotConfig) -> bool:
    return bool(bot.payment_provider_token)


# ── messaging ───────────────────────────────────────────────────────────────

def send(bot: BotConfig, chat_id, text: str, **kw):
    try:
        return TelegramAPI(bot.token).call('sendMessage', chat_id=chat_id, text=text, parse_mode='HTML', **kw)
    except TelegramError as exc:
        logger.warning('Telegram send to %s failed: %s', chat_id, exc)
        return None


def notify_guest(booking: Booking, key: str, **kw):
    chat = booking.telegram_chat
    if chat:
        send(chat.bot, chat.chat_id, t(chat.language, key, reference=booking.reference, **kw))


def notify_managers(bot: BotConfig, text: str):
    if bot.notify_chat_id:
        send(bot, bot.notify_chat_id, text)


# ── availability ────────────────────────────────────────────────────────────

def free_rooms(hotel_id: int, check_in: date, check_out: date):
    busy = Booking.objects.filter(
        hotel_id=hotel_id, status__in=ACTIVE, check_in__lt=check_out, check_out__gt=check_in
    ).values('room_id')
    return (
        Room.objects.filter(hotel_id=hotel_id)
        .exclude(status__in=[RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_ORDER])
        .exclude(id__in=busy)
        .select_related('room_type')
        .order_by('room_number')
    )


def available_room_types(hotel_id: int, check_in: date, check_out: date, guests: int) -> list[RoomType]:
    seen = {}
    for room in free_rooms(hotel_id, check_in, check_out):
        rt = room.room_type
        if rt.max_occupancy >= guests and rt.id not in seen:
            seen[rt.id] = rt
    return sorted(seen.values(), key=lambda rt: rt.base_price)


# ── requests ────────────────────────────────────────────────────────────────

def open_request(chat: TelegramChat):
    """The chat's request that is still waiting for the manager or for payment."""
    return chat.bookings.filter(status=BookingStatus.PENDING).order_by('-created_at').first()


def _digits(phone: str) -> str:
    return ''.join(ch for ch in phone or '' if ch.isdigit())


def find_guest_by_phone(hotel_id: int, phone: str):
    """The hotel's existing guest with this phone, however it was typed
    (+998 90 123-45-67, 998901234567, 90 123 45 67 …): the last 9 digits must match."""
    from apps.guests.models import Guest
    tail = _digits(phone)[-9:]
    if len(tail) < 7:
        return None
    # Prefilter on the last 2 digits only: in "45-67" style numbers just those are surely adjacent
    candidates = Guest.objects.filter(hotel_id=hotel_id, phone__contains=tail[-2:]).order_by('-updated_at')
    return next((g for g in candidates if _digits(g.phone)[-9:] == tail), None)


def chat_loyalty_percent(chat: TelegramChat) -> Decimal:
    """Returning-guest discount (%) for this chat's guest (linked profile, or the same phone at the desk)."""
    from apps.bookings.services import loyalty_percent
    guest_id = chat.guest_id
    if not guest_id and chat.phone:
        found = find_guest_by_phone(chat.bot.hotel_id, chat.phone)
        guest_id = found.id if found else None
    return loyalty_percent(chat.bot.hotel_id, guest_id)


def pct_text(pct: Decimal) -> str:
    return f'{pct:.0f}' if pct == pct.to_integral_value() else f'{pct.normalize()}'


def stay_price_text(chat: TelegramChat, amount: Decimal, pct: Decimal = None) -> str:
    """The stay's price as the guest will pay it: with a returning guest's discount shown crossed out."""
    pct = chat_loyalty_percent(chat) if pct is None else pct
    if not pct:
        return price_text(chat.bot, amount)
    # same rounding as apps.bookings.services.loyalty_discount, which sets the booking's real total
    after = Decimal(amount) - (Decimal(amount) * pct / 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return f'<s>{price_text(chat.bot, amount)}</s> <b>{price_text(chat.bot, after)}</b> (−{pct_text(pct)}%)'


def _guest_for(chat: TelegramChat):
    from apps.guests.models import Guest
    hotel_id = chat.bot.hotel_id
    guest = chat.guest
    if guest is None and chat.phone:
        # e.g. the reception registered this guest months ago: reuse that record, not a new one
        guest = find_guest_by_phone(hotel_id, chat.phone)
    if guest is None:
        guest = Guest(hotel_id=hotel_id)
    guest.first_name = chat.first_name or guest.first_name or 'Telegram'
    guest.last_name = chat.last_name or guest.last_name
    guest.phone = chat.phone or guest.phone
    note = f'Telegram: @{chat.username}' if chat.username else f'Telegram ID: {chat.chat_id}'
    if note not in (guest.notes or ''):
        guest.notes = f'{guest.notes}\n{note}'.strip()
    guest.save()
    if chat.guest_id != guest.id:
        chat.guest = guest
        chat.save(update_fields=['guest'])
    return guest


def create_request(chat: TelegramChat, room_type_id: int, check_in: date, check_out: date, guests: int):
    """Hold the first free room of this type as a PENDING request. None if all were taken."""
    bot = chat.bot
    guest = _guest_for(chat)
    for room in free_rooms(bot.hotel_id, check_in, check_out).filter(room_type_id=room_type_id):
        try:
            booking = create_booking(
                hotel_id=bot.hotel_id, room_id=room.id, guest_id=guest.id,
                check_in=check_in, check_out=check_out, num_adults=guests, num_children=0,
                special_requests='', created_by=None,
                status=BookingStatus.PENDING, source=BookingSource.TELEGRAM, telegram_chat=chat,
            )
        except ValidationError:
            continue  # taken a moment ago; try the next room
        notify_managers(bot, (
            f"🆕 Telegram bron so'rovi <b>{booking.reference}</b>\n"
            f"{html.escape(guest.full_name)}, {html.escape(guest.phone or '')}\n"
            f"{html.escape(room.room_type.name)} · {html.escape(room.room_number)}-xona\n"
            f"{fmt_date(check_in)} — {fmt_date(check_out)}, {guests} kishi\n"
            f"{price_text(bot, booking.total_amount)}\n\nPanel → Bronlar → Tasdiqlash"
        ))
        return booking
    return None


def send_invoice(booking: Booking):
    chat = booking.telegram_chat
    bot = chat.bot
    uzs = uzs_amount(bot, booking.total_amount)
    nights = (booking.check_out - booking.check_in).days
    lang = chat.language
    TelegramAPI(bot.token).call(
        'sendInvoice',
        chat_id=chat.chat_id,
        title=t(lang, 'invoice_title', reference=booking.reference)[:32],
        description=t(
            lang, 'invoice_desc', hotel=bot.hotel.name, room_type=booking.room.room_type.name,
            check_in=fmt_date(booking.check_in), check_out=fmt_date(booking.check_out), nights=nights,
        )[:255],
        payload=f'booking:{booking.id}',
        provider_token=bot.payment_provider_token,
        currency='UZS',
        prices=[{'label': booking.reference, 'amount': uzs * 100}],  # tiyin
    )


def approve(booking: Booking, user) -> str:
    """Manager approved a Telegram request. Returns a short note for the panel."""
    if booking.source != BookingSource.TELEGRAM or booking.status != BookingStatus.PENDING or booking.approved_at:
        raise ValidationError({'detail': "Bu so'rovni tasdiqlab bo'lmaydi."})
    bot = booking.telegram_chat.bot if booking.telegram_chat else None
    booking.approved_at = timezone.now()

    if bot and payments_enabled(bot):
        booking.payment_due_at = booking.approved_at + timedelta(hours=bot.payment_hours)
        booking.save(update_fields=['approved_at', 'payment_due_at', 'updated_at'])
        notify_guest(booking, 'approved_pay', due=local_dt(bot, booking.payment_due_at))
        try:
            send_invoice(booking)
        except TelegramError as exc:
            logger.warning('Invoice for %s failed: %s', booking.reference, exc)
            return f"Tasdiqlandi, lekin to'lov xabari yuborilmadi: {exc}. Mijoz botda \"Mening bronlarim\" orqali to'lashi mumkin."
        return f"Tasdiqlandi. Mijozga to'lov yuborildi ({local_dt(bot, booking.payment_due_at)} gacha)."

    booking.save(update_fields=['approved_at', 'updated_at'])
    transition_booking(booking, BookingStatus.CONFIRMED, user, 'Approved (no online payment configured).')
    if bot:
        notify_guest(booking, 'approved_no_payment', check_in=fmt_date(booking.check_in), check_out=fmt_date(booking.check_out))
    return "Tasdiqlandi. Onlayn to'lov sozlanmagan, shuning uchun bron to'lovsiz tasdiqlandi."


def reject(booking: Booking, user, reason: str = ''):
    if booking.status != BookingStatus.PENDING:
        raise ValidationError({'detail': "Bu so'rovni rad etib bo'lmaydi."})
    booking.cancellation_reason = reason or 'Rejected by manager.'
    booking.save(update_fields=['cancellation_reason', 'updated_at'])
    transition_booking(booking, BookingStatus.CANCELLED, user, f'Rejected: {reason}'.strip())
    lang = booking.telegram_chat.language if booking.telegram_chat else 'uz'
    notify_guest(booking, 'rejected', reason=f"\n{'Sabab' if lang == 'uz' else 'Причина'}: {reason}" if reason else '')


def paid_total(booking: Booking) -> Decimal:
    return sum((p.amount for p in booking.payments.all() if p.status == 'succeeded'), Decimal('0'))


def blocked(chat: TelegramChat) -> bool:
    """The guest (matched by the linked profile or phone) is on the hotel's blacklist."""
    from apps.guests.models import Guest
    guest = chat.guest
    if guest is None and chat.phone:
        guest = Guest.objects.filter(hotel_id=chat.bot.hotel_id, phone=chat.phone).first()
    return bool(guest and guest.is_blacklisted)


# ── reviews ─────────────────────────────────────────────────────────────────

def ask_review(booking: Booking):
    """After check-out: ask the guest for a 1-5 rating (once per booking)."""
    from apps.bookings.models import BookingReview
    chat = booking.telegram_chat
    if not chat or BookingReview.objects.filter(booking=booking).exists():
        return
    rows = [[{'text': '⭐' * n, 'callback_data': f'rv:{booking.id}:{n}'}] for n in range(5, 0, -1)]
    send(chat.bot, chat.chat_id, t(chat.language, 'review_ask', hotel=chat.bot.hotel.name),
         reply_markup={'inline_keyboard': rows})


def _guest_stays(chat: TelegramChat):
    """Finished stays of this chat's guest: booked in the bot, or at the desk under the same guest profile/phone."""
    from django.db.models import Q
    from apps.guests.models import Guest
    who = Q(telegram_chat=chat)
    if chat.guest_id:
        who |= Q(guest_id=chat.guest_id)
    elif chat.phone:
        who |= Q(guest__in=Guest.objects.filter(hotel_id=chat.bot.hotel_id, phone=chat.phone))
    return Booking.objects.filter(who, hotel_id=chat.bot.hotel_id, status=BookingStatus.CHECKED_OUT)


def unrated_stay(chat: TelegramChat):
    return _guest_stays(chat).filter(review__isnull=True).order_by('-check_out').first()


def hotel_reviews(bot: BotConfig, offset: int, limit: int):
    from django.db.models import Avg, Count
    from apps.bookings.models import BookingReview
    qs = BookingReview.objects.filter(hotel_id=bot.hotel_id)
    agg = qs.aggregate(avg=Avg('rating'), count=Count('id'))
    return agg, list(qs.select_related('guest').order_by('-created_at')[offset:offset + limit])


def save_rating(chat: TelegramChat, booking_id: int, rating: int):
    """Store the rating. Returns the booking, or None if it is not this guest's finished stay or already rated."""
    from apps.bookings.models import BookingReview
    booking = _guest_stays(chat).filter(pk=booking_id).select_related('guest').first()
    if not booking or not 1 <= rating <= 5:
        return None
    review, created = BookingReview.objects.get_or_create(
        booking=booking, defaults={'hotel_id': booking.hotel_id, 'guest': booking.guest, 'rating': rating},
    )
    if not created:
        return None
    guest_name = html.escape(booking.guest.full_name)
    notify_managers(chat.bot, f"{'⭐' * rating} ({rating}/5) — {guest_name}, {booking.reference}")
    return booking


def save_review_comment(chat: TelegramChat, booking_id: int, text: str):
    from apps.bookings.models import BookingReview
    review = BookingReview.objects.filter(
        booking_id=booking_id, booking__in=_guest_stays(chat)
    ).select_related('guest', 'booking').first()
    if review and not review.comment:
        review.comment = text[:1000]
        review.save(update_fields=['comment', 'updated_at'])
        notify_managers(chat.bot, f"💬 {html.escape(review.guest.full_name)} ({review.rating}/5, {review.booking.reference}):\n"
                                  f"{html.escape(review.comment)}")


def withdraw_request(booking: Booking):
    """The guest withdrew a booking request the manager has not answered yet: nothing to decide, cancel now."""
    booking.cancellation_reason = 'Cancelled by guest in Telegram.'
    booking.save(update_fields=['cancellation_reason', 'updated_at'])
    transition_booking(booking, BookingStatus.CANCELLED, None, 'Request withdrawn by guest in Telegram.')
    notify_managers(booking.telegram_chat.bot, f"❌ {booking.reference}: mijoz so'rovni bekor qildi.")


def request_cancel(booking: Booking):
    """The guest asks to cancel an accepted booking. It stays as is until a manager decides in the panel."""
    booking.cancel_requested_at = timezone.now()
    booking.save(update_fields=['cancel_requested_at', 'updated_at'])
    bot = booking.telegram_chat.bot
    paid = paid_total(booking)
    text = (f"📨 <b>{booking.reference}</b>: mijoz bronni bekor qilishni so'rayapti.\n"
            f"👤 {html.escape(booking.guest.full_name)} {html.escape(booking.guest.phone or '')}\n"
            f"🛏 {html.escape(booking.room.room_number)} ({html.escape(booking.room.room_type.name)})\n"
            f"📅 {fmt_date(booking.check_in)} — {fmt_date(booking.check_out)}\n")
    if paid:
        text += f"💳 To'langan: {price_text(bot, paid)}\n"
    text += "\nPanelda «Bronlar» bo'limida tasdiqlang yoki rad eting."
    notify_managers(bot, text)
    logger.info('Booking %s: guest asked to cancel', booking.reference)


def _expire_one(booking_id: int, reason: str, note: str):
    """Cancel one lapsed request. Safe to run from several processes at once (web, bot, cron):
    the row is locked and re-checked, so a request is cancelled - and the guest told - only once."""
    with transaction.atomic():
        # of=('self',): lock only the booking row. PostgreSQL refuses FOR UPDATE on the
        # nullable side of the outer join that select_related('telegram_chat') produces.
        b = (Booking.objects.select_for_update(of=('self',)).select_related('telegram_chat__bot', 'room')
             .filter(pk=booking_id, status=BookingStatus.PENDING).first())
        if not b:
            return None  # already handled elsewhere
        b.cancellation_reason = reason
        b.save(update_fields=['cancellation_reason', 'updated_at'])
        transition_booking(b, BookingStatus.CANCELLED, None, note)
    return b


def expire_stale(hotel_id=None) -> int:
    """Cancel Telegram requests whose time to pay ran out, or whose arrival day has passed unanswered.
    Runs on every bot update, when the panel lists bookings or creates one, and on a schedule
    (manage.py expire_telegram_requests / Celery beat), so a lapsed request never keeps a room."""
    now = timezone.now()
    qs = Booking.objects.filter(source=BookingSource.TELEGRAM, status=BookingStatus.PENDING)
    if hotel_id:
        qs = qs.filter(hotel_id=hotel_id)
    count = 0
    for pk in list(qs.filter(payment_due_at__lt=now).values_list('pk', flat=True)):
        b = _expire_one(pk, 'Payment time expired.', 'Payment time expired.')
        if b:
            notify_guest(b, 'expired')
            count += 1
    for pk in list(qs.filter(approved_at__isnull=True, check_in__lt=timezone.localdate()).values_list('pk', flat=True)):
        if _expire_one(pk, 'Not answered before arrival date.', 'Request expired.'):
            count += 1
    return count


# ── payments ────────────────────────────────────────────────────────────────

def _booking_from_payload(payload: str):
    if not payload.startswith('booking:'):
        return None
    try:
        return Booking.objects.select_related('telegram_chat__bot__hotel', 'room__room_type').get(
            pk=int(payload.split(':', 1)[1])
        )
    except (ValueError, Booking.DoesNotExist):
        return None


def payable(booking: Booking, bot: BotConfig, amount_tiyin=None) -> bool:
    if not booking or booking.telegram_chat is None or booking.telegram_chat.bot_id != bot.id:
        return False
    if booking.status != BookingStatus.PENDING or not booking.approved_at:
        return False
    if booking.payment_due_at and booking.payment_due_at < timezone.now():
        return False
    uzs = uzs_amount(bot, booking.total_amount)
    return amount_tiyin is None or amount_tiyin == uzs * 100


def send_bill_invoice(stay):
    """Invoice for everything the guest owes for the stay in progress (room balance + unpaid orders)."""
    from apps.room_service.services import bill, bill_payload
    chat = stay.telegram_chat
    bot = chat.bot
    due = bill(stay)['due']
    TelegramAPI(bot.token).call(
        'sendInvoice', chat_id=chat.chat_id,
        title=t(chat.language, 'bill_invoice_title', room=stay.room.room_number)[:32],
        description=t(chat.language, 'bill_invoice_desc', hotel=bot.hotel.name, reference=stay.reference)[:255],
        payload=bill_payload(stay, due), provider_token=bot.payment_provider_token, currency='UZS',
        prices=[{'label': stay.reference, 'amount': uzs_amount(bot, due) * 100}],
    )


def _bill_pre_checkout(bot: BotConfig, query: dict):
    from apps.room_service.services import bill_from_payload, bill_still_due
    stay, amount = bill_from_payload(query.get('invoice_payload', ''))
    ok = (bill_still_due(stay, amount) and stay.telegram_chat and stay.telegram_chat.bot_id == bot.id
          and query.get('currency') == 'UZS' and query.get('total_amount') == uzs_amount(bot, amount) * 100)
    lang = stay.telegram_chat.language if stay and stay.telegram_chat else 'uz'
    TelegramAPI(bot.token).call('answerPreCheckoutQuery', pre_checkout_query_id=query['id'], ok=bool(ok),
                                error_message=None if ok else t(lang, 'bill_changed'))


def _bill_paid(bot: BotConfig, chat: TelegramChat, sp: dict):
    from apps.room_service.services import bill_from_payload, record_bill_payment
    stay, amount = bill_from_payload(sp.get('invoice_payload', ''))
    charge_id = sp.get('provider_payment_charge_id') or sp.get('telegram_payment_charge_id', '')
    if stay is None:
        logger.error('Bill payment %s with unknown payload %s', charge_id, sp.get('invoice_payload'))
        return
    extra = {'telegram_payment_charge_id': sp.get('telegram_payment_charge_id'),
             'uzs_total': sp.get('total_amount', 0) / 100, 'currency': sp.get('currency')}
    if record_bill_payment(stay, amount, charge_id, bot.payment_provider_name or 'telegram', extra):
        send(bot, chat.chat_id, t(chat.language, 'bill_paid', amount=som(amount)))
        notify_managers(bot, f"💳 {stay.room.room_number}-xona ({stay.reference}) hisobini to'ladi: {som(amount)}.")


def handle_pre_checkout(bot: BotConfig, query: dict):
    if query.get('invoice_payload', '').startswith('bill:'):
        return _bill_pre_checkout(bot, query)
    booking = _booking_from_payload(query.get('invoice_payload', ''))
    ok = payable(booking, bot, query.get('total_amount')) and query.get('currency') == 'UZS'
    lang = booking.telegram_chat.language if booking and booking.telegram_chat else 'uz'
    TelegramAPI(bot.token).call(
        'answerPreCheckoutQuery', pre_checkout_query_id=query['id'], ok=ok,
        error_message=None if ok else t(lang, 'precheckout_fail'),
    )


@transaction.atomic
def handle_successful_payment(bot: BotConfig, chat: TelegramChat, sp: dict):
    from apps.payments.models import Payment, PaymentStatus

    if sp.get('invoice_payload', '').startswith('bill:'):
        return _bill_paid(bot, chat, sp)
    charge_id = sp.get('provider_payment_charge_id') or sp.get('telegram_payment_charge_id', '')
    if Payment.objects.filter(provider_transaction_id=charge_id).exists():
        return  # already recorded (Telegram retried the update)
    booking = _booking_from_payload(sp.get('invoice_payload', ''))
    if booking is None:
        logger.error('Payment %s with unknown payload %s', charge_id, sp.get('invoice_payload'))
        return
    booking = Booking.objects.select_for_update().get(pk=booking.pk)

    Payment.objects.create(
        booking=booking, hotel_id=booking.hotel_id, status=PaymentStatus.SUCCEEDED,
        amount=booking.total_amount, currency=booking.currency,
        provider=bot.payment_provider_name or 'telegram', provider_transaction_id=charge_id,
        provider_metadata={
            'telegram_payment_charge_id': sp.get('telegram_payment_charge_id'),
            'uzs_total': sp.get('total_amount', 0) / 100,
            'currency': sp.get('currency'),
        },
        processed_at=timezone.now(),
    )
    if booking.status == BookingStatus.PENDING:
        transition_booking(booking, BookingStatus.CONFIRMED, None, 'Paid via Telegram.')
        send(bot, chat.chat_id, t(
            chat.language, 'paid', reference=booking.reference,
            check_in=fmt_date(booking.check_in), check_out=fmt_date(booking.check_out),
        ))
        notify_managers(bot, f"💳 {booking.reference} uchun to'lov keldi: {price_text(bot, booking.total_amount)}. Bron tasdiqlandi.")
    else:
        # Paid after the booking was cancelled: money must go back by hand
        notify_managers(bot, f"⚠️ {booking.reference} uchun to'lov keldi, lekin bron holati: {booking.status}. Pulni qaytarish kerak.")
        logger.error('Payment for %s arrived in status %s', booking.reference, booking.status)


# ── reminders (run by the scheduled job) ────────────────────────────────────

def _remind_once(booking: Booking, kind: str) -> bool:
    """Mark this reminder as sent; False if it already was (so each one goes out once)."""
    from .models import SentReminder
    _, created = SentReminder.objects.get_or_create(booking=booking, kind=kind)
    return created


def send_reminders(now=None) -> int:
    """Tell Telegram guests: the day before arrival (address, check-in time), on the morning of departure
    (check-out time, with the bill), and once more a day after leaving if they have not rated the stay."""
    from apps.hotels.models import HotelSettings
    now = now or timezone.now()
    sent = 0
    for bot in BotConfig.objects.filter(is_active=True).select_related('hotel'):
        hotel = bot.hotel
        try:
            local = timezone.localtime(now, ZoneInfo(hotel.timezone))
        except Exception:
            local = timezone.localtime(now)
        today = local.date()
        s = HotelSettings.objects.filter(hotel=hotel).first()
        check_in_time = s.check_in_time.strftime('%H:%M') if s and s.check_in_time else '14:00'
        check_out_time = s.check_out_time.strftime('%H:%M') if s and s.check_out_time else '11:00'
        mine = Booking.objects.filter(hotel_id=hotel.id, telegram_chat__bot=bot).select_related('telegram_chat', 'room')

        for b in mine.filter(status=BookingStatus.CONFIRMED, check_in=today + timedelta(days=1)):
            if _remind_once(b, 'arrival'):
                chat = b.telegram_chat
                address = ', '.join(x for x in [hotel.address_line1, hotel.city] if x) or '—'
                send(bot, chat.chat_id, t(chat.language, 'remind_arrival', hotel=html.escape(hotel.name),
                                          address=html.escape(address), check_in=fmt_date(b.check_in),
                                          time=check_in_time, phone=hotel.phone or '—', reference=b.reference))
                sent += 1

        if local.hour >= 8:  # not in the middle of the night
            for b in mine.filter(status=BookingStatus.CHECKED_IN, check_out=today):
                if _remind_once(b, 'checkout'):
                    chat = b.telegram_chat
                    send(bot, chat.chat_id, t(chat.language, 'remind_checkout', time=check_out_time),
                         reply_markup={'inline_keyboard': [[{'text': t(chat.language, 'bill_btn'),
                                                             'callback_data': 'rsb'}]]})
                    sent += 1

        left = mine.filter(status=BookingStatus.CHECKED_OUT, review__isnull=True,
                           actual_check_out__lte=now - timedelta(days=1),
                           actual_check_out__gte=now - timedelta(days=3))
        for b in left:
            if _remind_once(b, 'review'):
                ask_review(b)
                sent += 1
    return sent
