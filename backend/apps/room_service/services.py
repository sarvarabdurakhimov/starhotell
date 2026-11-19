"""Room service rules shared by the Mini App (guest) and the panel (staff)."""
import html
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.bookings.models import Booking, BookingStatus
from apps.common.money import som

from .models import ItemCategory, OrderStatus, ServiceItem, ServiceOrder, ServiceOrderLine

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
    menu = {i.id: i for i in ServiceItem.objects.filter(hotel_id=stay.hotel_id, is_active=True, id__in=wanted)}
    if len(menu) != len(wanted):
        raise ValidationError({'detail': "Ba'zi narsalar endi menyuda yo'q. Sahifani yangilang."})

    with transaction.atomic():
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
    return order


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
    _notify_guest(order, f'order_{new_status}')
    return order


def cancel_by_guest(order: ServiceOrder) -> ServiceOrder:
    """The guest may take back an order until the staff accepts it."""
    if order.status != OrderStatus.NEW:
        raise ValidationError({'detail': "Buyurtma qabul qilingan, uni endi qabulxona orqali bekor qilish mumkin."})
    order.status = OrderStatus.CANCELLED
    order.save(update_fields=['status', 'updated_at'])
    from apps.telegram_bot.services import notify_managers
    if order.telegram_chat:
        notify_managers(order.telegram_chat.bot,
                        f"❌ Buyurtma #{order.pk} ({order.room.room_number}-xona): mijoz bekor qildi.")
    return order
