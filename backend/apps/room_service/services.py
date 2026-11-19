"""Room service rules shared by the Mini App (guest) and the panel (staff)."""
import html
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.bookings.models import Booking, BookingStatus
from apps.common.money import som

from .models import (GuestRequest, ItemCategory, OrderStatus, RequestKind, RequestStatus, ServiceItem,
                     ServiceOrder, ServiceOrderLine)

MAX_LINES = 30
MAX_QUANTITY = 20

# Offered once to a hotel with an empty menu; the hotel edits names and prices in the panel.
DEFAULT_ITEMS = [
    ('Suv 0,5 L', ItemCategory.DRINK, 5000),
    ('Suv 1,5 L', ItemCategory.DRINK, 8000),
    ("Choy (choynak)", ItemCategory.DRINK, 10000),
    ('Qahva', ItemCategory.DRINK, 15000),
    ('Meva assorti', ItemCategory.FRUIT, 40000),
    ('Osh', ItemCategory.FOOD, 45000),
    ("Lag'mon", ItemCategory.FOOD, 40000),
    ('Non', ItemCategory.FOOD, 5000),
    ('Sochiq', ItemCategory.LINEN, 0),
    ("Ko'rpa", ItemCategory.LINEN, 0),
    ("Ko'rpacha", ItemCategory.LINEN, 0),
    ('Yostiq', ItemCategory.LINEN, 0),
    ('Choyshab almashtirish', ItemCategory.LINEN, 0),
    ('Tish cho\'tkasi va pasta', ItemCategory.HYGIENE, 10000),
    ('Shampun', ItemCategory.HYGIENE, 0),
]


def add_default_items(hotel_id: int) -> int:
    """Fill an empty menu with common items. Returns how many were added (0 if the menu had items)."""
    if ServiceItem.objects.filter(hotel_id=hotel_id).exists():
        return 0
    ServiceItem.objects.bulk_create([
        ServiceItem(hotel_id=hotel_id, name=name, category=cat, price=Decimal(price), position=i)
        for i, (name, cat, price) in enumerate(DEFAULT_ITEMS)
    ])
    return len(DEFAULT_ITEMS)


def current_stay(chat):
    """The guest's stay that is in progress now (checked in), booked in the bot or at the desk."""
    who = Q(telegram_chat=chat)
    if chat.guest_id:
        who |= Q(guest_id=chat.guest_id)
    return (Booking.objects.filter(who, hotel_id=chat.bot.hotel_id, status=BookingStatus.CHECKED_IN)
            .select_related('room').order_by('-actual_check_in').first())


# Telegram failures are logged and swallowed by send(): the panel still shows the order.

def _notify_guest(order: ServiceOrder, key: str, **kw):
    from apps.telegram_bot.services import send
    from apps.telegram_bot.texts import t
    chat = order.telegram_chat
    if chat:
        send(chat.bot, chat.chat_id, t(chat.language, key, number=order.pk, **kw))


def welcome_guest(booking):
    """After check-in: tell the Telegram guest they can order to the room.

    The button opens the Mini App's Services tab when the app has an https address, otherwise the order
    screen in the chat itself, so ordering never depends on the Mini App being deployed.
    """
    from apps.telegram_bot.services import send
    from apps.telegram_bot.texts import t
    from apps.telegram_bot.webapp import webapp_url
    chat = booking.telegram_chat
    if not chat:
        return
    url = webapp_url(chat.bot)
    button = {'text': t(chat.language, 'stay_services')}
    button.update({'web_app': {'url': f'{url}?tab=services'}} if url else {'callback_data': 'rs'})
    send(chat.bot, chat.chat_id, t(chat.language, 'stay_welcome', room=booking.room.room_number),
         reply_markup={'inline_keyboard': [[button]]})


def _notify_staff(order: ServiceOrder):
    from apps.telegram_bot.services import notify_managers
    chat = order.telegram_chat
    if not chat:
        return
    lines = '\n'.join(f'• {html.escape(li.name)} × {li.quantity}' for li in order.lines.all())
    note = f'\n💬 {html.escape(order.note)}' if order.note else ''
    notify_managers(chat.bot, (
        f"🛎 Yangi buyurtma <b>#{order.pk}</b> — {order.room.room_number}-xona\n{lines}{note}\n"
        f"Jami: {som(order.total)}\n\nPanel → Buyurtmalar"
    ))


def create_order(chat, items: list, note: str = '') -> ServiceOrder:
    """items: [{'id': <ServiceItem id>, 'quantity': n}, ...] from the guest's cart."""
    stay = current_stay(chat)
    if not stay:
        raise ValidationError({'detail': "Buyurtma faqat mehmonxonada yashayotgan paytda beriladi."})
    wanted = {}
    for row in items if isinstance(items, list) else []:
        try:
            item_id, qty = int(row.get('id')), int(row.get('quantity') or 1)
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({'detail': "Buyurtma noto'g'ri."})
        if not 1 <= qty <= MAX_QUANTITY:
            raise ValidationError({'detail': f"Bitta narsadan ko'pi bilan {MAX_QUANTITY} ta."})
        wanted[item_id] = wanted.get(item_id, 0) + qty
    if not wanted or len(wanted) > MAX_LINES:
        raise ValidationError({'detail': "Kamida bitta narsa tanlang."})
    with transaction.atomic():
        # Locked, so two guests cannot both take the last bottle
        menu = {i.id: i for i in ServiceItem.objects.select_for_update()
                .filter(hotel_id=stay.hotel_id, is_active=True, id__in=wanted)}
        if len(menu) != len(wanted):
            raise ValidationError({'detail': "Ba'zi narsalar endi menyuda yo'q. Sahifani yangilang."})
        running_low = []
        for i, q in wanted.items():
            item = menu[i]
            if item.stock is None:
                continue
            if item.stock < q:
                left = f'faqat {item.stock} ta qoldi' if item.stock else 'tugagan'
                raise ValidationError({'detail': f'{item.name}: {left}.'})
            was = item.stock
            item.stock -= q
            item.save(update_fields=['stock', 'updated_at'])
            if item.stock <= item.low_stock < was:
                running_low.append(item)
        order = ServiceOrder.objects.create(
            hotel_id=stay.hotel_id, booking=stay, room=stay.room, telegram_chat=chat, note=(note or '').strip()[:500],
        )
        ServiceOrderLine.objects.bulk_create([
            ServiceOrderLine(order=order, item=menu[i], name=menu[i].name, price=menu[i].price, quantity=q)
            for i, q in wanted.items()
        ])
        order.total = sum((menu[i].price * q for i, q in wanted.items()), Decimal('0'))
        order.save(update_fields=['total'])
    _notify_staff(order)
    for item in running_low:
        _warn_low_stock(order, item)
    return order


def orderable_items(hotel_id: int):
    """What a guest can order now: shown on the menu and not out of stock."""
    return ServiceItem.objects.filter(Q(stock__isnull=True) | Q(stock__gt=0), hotel_id=hotel_id, is_active=True)


def _warn_low_stock(order: ServiceOrder, item: ServiceItem):
    from apps.telegram_bot.services import notify_managers
    if order.telegram_chat:
        left = f'{item.stock} ta qoldi' if item.stock else 'tugadi — mehmonlar endi buyurtma qila olmaydi'
        notify_managers(order.telegram_chat.bot,
                        f"⚠️ Ombor: <b>{html.escape(item.name)}</b> — {left}.\nPanel → Buyurtmalar → Menyu")


def _restock(order: ServiceOrder):
    """A cancelled order gives its counted items back to stock."""
    for line in order.lines.select_related('item'):
        if line.item_id and line.item and line.item.stock is not None:
            ServiceItem.objects.filter(pk=line.item_id).update(stock=F('stock') + line.quantity)


# Allowed moves: a new order is accepted or cancelled; an accepted one is delivered or cancelled.
NEXT = {
    OrderStatus.NEW: {OrderStatus.ACCEPTED, OrderStatus.DELIVERED, OrderStatus.CANCELLED},
    OrderStatus.ACCEPTED: {OrderStatus.DELIVERED, OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}


def set_status(order: ServiceOrder, new_status: str, user=None) -> ServiceOrder:
    if new_status not in NEXT.get(order.status, set()):
        raise ValidationError({'detail': f"Buyurtmani '{order.get_status_display()}' holatidan o'zgartirib bo'lmaydi."})
    order.status = new_status
    order.handled_by = user if user and user.is_authenticated else order.handled_by
    fields = ['status', 'handled_by', 'updated_at']
    if new_status == OrderStatus.DELIVERED:
        order.delivered_at = timezone.now()
        fields.append('delivered_at')
    order.save(update_fields=fields)
    if new_status == OrderStatus.CANCELLED:
        _restock(order)
    _notify_guest(order, f'order_{new_status}')
    return order


def cancel_by_guest(order: ServiceOrder) -> ServiceOrder:
    """The guest may take back an order until the staff accepts it."""
    if order.status != OrderStatus.NEW:
        raise ValidationError({'detail': "Buyurtma qabul qilingan, uni endi qabulxona orqali bekor qilish mumkin."})
    order.status = OrderStatus.CANCELLED
    order.save(update_fields=['status', 'updated_at'])
    _restock(order)
    from apps.telegram_bot.services import notify_managers
    if order.telegram_chat:
        notify_managers(order.telegram_chat.bot,
                        f"❌ Buyurtma #{order.pk} ({order.room.room_number}-xona): mijoz bekor qildi.")
    return order


# ── cleaning / repair requests ──────────────────────────────────────────────

REQUEST_NEXT = {
    RequestStatus.NEW: {RequestStatus.ACCEPTED, RequestStatus.DONE, RequestStatus.CANCELLED},
    RequestStatus.ACCEPTED: {RequestStatus.DONE, RequestStatus.CANCELLED},
    RequestStatus.DONE: set(),
    RequestStatus.CANCELLED: set(),
}


def create_guest_request(chat, kind: str, text: str = '') -> GuestRequest:
    """The guest asks for cleaning or reports a problem; the staff are told at once."""
    from apps.telegram_bot.services import notify_managers
    stay = current_stay(chat)
    if not stay:
        raise ValidationError({'detail': "So'rov faqat mehmonxonada yashayotgan paytda yuboriladi."})
    if kind not in RequestKind.values:
        raise ValidationError({'detail': "So'rov turi noto'g'ri."})
    req = GuestRequest.objects.create(hotel_id=stay.hotel_id, booking=stay, room=stay.room, telegram_chat=chat,
                                      kind=kind, text=(text or '').strip()[:500])
    icon = '🧹' if kind == RequestKind.CLEANING else '🔧'
    note = f'\n💬 {html.escape(req.text)}' if req.text else ''
    notify_managers(chat.bot, (
        f"{icon} {req.get_kind_display()} <b>#{req.pk}</b> — {stay.room.room_number}-xona{note}\n\n"
        f"Panel → Buyurtmalar → So'rovlar"
    ))
    return req


def set_request_status(req: GuestRequest, new_status: str, user=None) -> GuestRequest:
    from apps.telegram_bot.services import send
    from apps.telegram_bot.texts import t
    if new_status not in REQUEST_NEXT.get(req.status, set()):
        raise ValidationError({'detail': f"So'rovni '{req.get_status_display()}' holatidan o'zgartirib bo'lmaydi."})
    req.status = new_status
    req.handled_by = user if user and user.is_authenticated else req.handled_by
    fields = ['status', 'handled_by', 'updated_at']
    if new_status == RequestStatus.DONE:
        req.done_at = timezone.now()
        fields.append('done_at')
    req.save(update_fields=fields)
    chat = req.telegram_chat
    if chat:
        send(chat.bot, chat.chat_id, t(chat.language, f'gr_{new_status}', number=req.pk,
                                       kind=t(chat.language, f'gr_kind_{req.kind}')))
    return req


# ── the guest's bill ────────────────────────────────────────────────────────

def _room_paid(stay) -> Decimal:
    """Money received for the room itself (a bill payment also covers orders: only its room part counts)."""
    return sum((Decimal(str(p.provider_metadata.get('room_part', p.amount)))
                for p in stay.payments.all() if p.status == 'succeeded'), Decimal('0'))


def bill(stay) -> dict:
    """What the guest owes for this stay: the room (minus what is paid) and room-service orders not yet paid."""
    orders = list(stay.service_orders.exclude(status=OrderStatus.CANCELLED).prefetch_related('lines')
                  .order_by('created_at'))
    unpaid = [o for o in orders if not o.is_paid and o.total > 0]
    room_paid = _room_paid(stay)
    room_due = max(Decimal('0'), stay.total_amount - room_paid)
    orders_due = sum((o.total for o in unpaid), Decimal('0'))
    return {
        'nights': (stay.check_out - stay.check_in).days, 'rate': stay.rate_per_night,
        'room_total': stay.total_amount, 'discount': stay.discount_amount, 'room_paid': room_paid,
        'room_due': room_due, 'orders': orders, 'unpaid_orders': unpaid, 'orders_due': orders_due,
        'due': room_due + orders_due,
    }


def bill_payload(stay, due: Decimal) -> str:
    return f'bill:{stay.id}:{int(due)}'


def bill_from_payload(payload: str):
    """(stay, amount) for a 'bill:<booking id>:<so'm>' invoice, or (None, 0)."""
    from apps.bookings.models import Booking
    try:
        _, booking_id, amount = payload.split(':')
        return (Booking.objects.select_related('telegram_chat__bot__hotel', 'room').get(pk=int(booking_id)),
                Decimal(amount))
    except (ValueError, Booking.DoesNotExist):
        return None, Decimal('0')


def bill_still_due(stay, amount: Decimal) -> bool:
    """The invoice is still right: the stay is in progress and the amount owed has not changed since."""
    return bool(stay) and stay.status == BookingStatus.CHECKED_IN and amount > 0 and bill(stay)['due'] == amount


@transaction.atomic
def record_bill_payment(stay, amount: Decimal, charge_id: str, provider: str, extra: dict) -> bool:
    """A paid bill: one Payment on the booking; the orders it covered are marked paid. False if already recorded."""
    from apps.payments.models import Payment, PaymentStatus
    if Payment.objects.filter(provider_transaction_id=charge_id).exists():
        return False
    b = bill(stay)
    Payment.objects.create(
        booking=stay, hotel_id=stay.hotel_id, status=PaymentStatus.SUCCEEDED, amount=amount, currency=stay.currency,
        provider=provider, provider_transaction_id=charge_id, processed_at=timezone.now(),
        provider_metadata={**extra, 'kind': 'bill', 'room_part': str(b['room_due']),
                           'orders': [o.id for o in b['unpaid_orders']]},
    )
    ServiceOrder.objects.filter(pk__in=[o.id for o in b['unpaid_orders']]).update(is_paid=True)
    return True
