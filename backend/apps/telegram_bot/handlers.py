"""Booking dialog: turns one Telegram update into replies."""
import calendar
import html
import logging
from datetime import date, timedelta

from apps.bookings.models import BookingStatus
from apps.common.money import som
from apps.rooms.models import RoomType, RoomTypePhoto

from . import services as svc
from .api import TelegramAPI, TelegramError
from .models import BotConfig, TelegramChat
from .texts import TEXTS, t

logger = logging.getLogger(__name__)


class Ctx:
    """One update being handled: the bot, the chat and shortcuts to reply."""

    def __init__(self, bot: BotConfig, chat: TelegramChat):
        self.bot, self.chat = bot, chat
        self.api = TelegramAPI(bot.token)
        self.lang = chat.language

    def t(self, key, **kw):
        return t(self.lang, key, **kw)

    def say(self, text, markup=None):
        """A message that stays in the chat (results, notices)."""
        return self.api.call(
            'sendMessage', chat_id=self.chat.chat_id, text=text, parse_mode='HTML', reply_markup=markup
        )

    # The current question and the guest's answers to it are tracked, and removed
    # as soon as the next question is asked, so only the open question is on screen.

    def track(self, *message_ids):
        known = list(self.chat.data.get('q') or [])
        ids = [i for i in message_ids if i and i not in known]
        if ids:
            self.chat.data = {**self.chat.data, 'q': list(self.chat.data.get('q') or []) + ids}
            self.chat.save(update_fields=['data', 'updated_at'])

    def clear(self):
        ids = list(self.chat.data.get('q') or [])
        self.api.delete_messages(self.chat.chat_id, ids)  # one call; gone / too old ones are skipped
        if ids:
            self.chat.data = {**self.chat.data, 'q': []}
            self.chat.save(update_fields=['data', 'updated_at'])

    def ask(self, text, markup=None):
        """Replace the previous question with this one."""
        self.clear()
        return self.ask_more(text, markup)

    def ask_more(self, text, markup=None):
        """Another message belonging to the current question (e.g. one room card)."""
        result = self.say(text, markup)
        self.track((result or {}).get('message_id'))
        return result

    def set_state(self, state, **data):
        self.chat.state = state
        if data:
            self.chat.data = {**self.chat.data, **data}
        self.chat.save(update_fields=['state', 'data', 'updated_at'])


# ── keyboards ───────────────────────────────────────────────────────────────

def main_menu(lang):
    return {
        'keyboard': [
            [{'text': t(lang, 'menu_book')}],
            [{'text': t(lang, 'menu_services')}],
            [{'text': t(lang, 'menu_my')}, {'text': t(lang, 'menu_reviews')}],
            [{'text': t(lang, 'menu_contact')}, {'text': t(lang, 'menu_lang')}],
        ],
        'resize_keyboard': True,
    }


def lang_keyboard():
    return {'inline_keyboard': [[
        {'text': "🇺🇿 O'zbekcha", 'callback_data': 'lang:uz'},
        {'text': '🇷🇺 Русский', 'callback_data': 'lang:ru'},
    ]]}


def month_keyboard(lang, kind, year, month, min_day: date, max_day: date):
    """Inline month calendar. kind: 'in' (arrival) or 'out' (departure)."""
    rows = []
    prev_m = date(year, month, 1) - timedelta(days=1)
    next_m = date(year, month, calendar.monthrange(year, month)[1]) + timedelta(days=1)
    nav = []
    nav.append(
        {'text': '◀️', 'callback_data': f'cal:{kind}:{prev_m:%Y-%m}'}
        if prev_m >= min_day.replace(day=1)
        else {'text': ' ', 'callback_data': 'noop'}
    )
    nav.append({'text': f"{t(lang, 'months')[month - 1]} {year}", 'callback_data': 'noop'})
    nav.append(
        {'text': '▶️', 'callback_data': f'cal:{kind}:{next_m:%Y-%m}'}
        if next_m <= max_day
        else {'text': ' ', 'callback_data': 'noop'}
    )
    rows.append(nav)
    rows.append([{'text': w, 'callback_data': 'noop'} for w in t(lang, 'weekdays')])
    for week in calendar.Calendar().monthdayscalendar(year, month):
        row = []
        for d in week:
            if d == 0:
                row.append({'text': ' ', 'callback_data': 'noop'})
                continue
            day = date(year, month, d)
            if min_day <= day <= max_day:
                row.append({'text': str(d), 'callback_data': f'{kind}:{day.isoformat()}'})
            else:
                row.append({'text': '·', 'callback_data': 'noop'})
        rows.append(row)
    if kind == 'out':
        rows.append([{'text': t(lang, 'back'), 'callback_data': 'book'}])
    return {'inline_keyboard': rows}


def guests_keyboard(lang, max_guests):
    nums = list(range(1, max(max_guests, 1) + 1))[:8]
    rows = [
        [{'text': t(lang, 'guests_n', n=n), 'callback_data': f'g:{n}'} for n in nums[i : i + 4]]
        for i in range(0, len(nums), 4)
    ]
    rows.append([{'text': t(lang, 'back'), 'callback_data': 'book'}])
    return {'inline_keyboard': rows}


# ── steps ───────────────────────────────────────────────────────────────────

MAX_TYPED_GUESTS = 50


def max_occupancy(bot) -> int:
    return max([rt.max_occupancy for rt in RoomType.objects.filter(hotel_id=bot.hotel_id)] or [1])


def choose_guests(c: Ctx, n: int):
    """The guest picked (button) or typed how many people: search rooms that fit them."""
    most = max_occupancy(c.bot)
    if n > most:
        return c.ask_more(c.t('too_many_guests', max=most, n=n))
    c.set_state('rooms', guests=n)
    c.ask(c.t('searching'))
    return show_rooms(c)


def _max_advance(bot):
    s = getattr(bot.hotel, 'settings', None)
    return getattr(s, 'max_advance_booking_days', 365) or 365


def ask_checkin(c: Ctx, month: str = None):
    today = svc.hotel_today(c.bot)
    last = today + timedelta(days=_max_advance(c.bot))
    y, m = (int(x) for x in month.split('-')) if month else (today.year, today.month)
    return c.t('pick_checkin'), month_keyboard(c.lang, 'in', y, m, today, last)


def ask_checkout(c: Ctx, month: str = None):
    ci = date.fromisoformat(c.chat.data['ci'])
    first, last = ci + timedelta(days=1), ci + timedelta(days=svc.MAX_NIGHTS)
    y, m = (int(x) for x in month.split('-')) if month else (first.year, first.month)
    return c.t('pick_checkout', check_in=svc.fmt_date(ci)), month_keyboard(c.lang, 'out', y, m, first, last)


def _send_photo(c: Ctx, photo: RoomTypePhoto, caption='', markup=None):
    """Send a stored photo; upload once per bot, then reuse Telegram's file_id."""
    key = c.bot.bot_username or str(c.bot.id)
    file_id = (photo.telegram_file_ids or {}).get(key)
    if file_id:
        try:
            return c.api.call('sendPhoto', chat_id=c.chat.chat_id, photo=file_id, caption=caption,
                              parse_mode='HTML', reply_markup=markup)
        except TelegramError:
            pass  # stale file_id: upload again
    result = c.api.send_photo_bytes(c.chat.chat_id, bytes(photo.image), caption, markup)
    sizes = (result or {}).get('photo') or []
    if sizes:
        photo.telegram_file_ids = {**(photo.telegram_file_ids or {}), key: sizes[-1]['file_id']}
        photo.save(update_fields=['telegram_file_ids'])
    return result


def show_rooms(c: Ctx):
    d = c.chat.data
    ci, co, guests = date.fromisoformat(d['ci']), date.fromisoformat(d['co']), int(d['guests'])
    nights = (co - ci).days
    types = svc.available_room_types(c.bot.hotel_id, ci, co, guests)
    if not types:
        c.clear()
        c.say(c.t('no_rooms', guests=guests))  # stays, so the guest knows why we start over
        c.set_state('dates')
        return c.ask_more(*ask_checkin(c))

    pct = svc.chat_loyalty_percent(c.chat)
    found = c.t('rooms_found', check_in=svc.fmt_date(ci), check_out=svc.fmt_date(co), guests=guests)
    if pct:
        found += '\n\n' + c.t('loyalty_badge', pct=svc.pct_text(pct))
    c.ask(found)
    for rt in types:
        caption = c.t(
            'room_caption', name=rt.name, description=(rt.description or '')[:300], occupancy=rt.max_occupancy,
            nights=nights, total=svc.stay_price_text(c.chat, rt.base_price * nights, pct),
        )
        if rt.amenities:
            caption += '\n' + c.t('room_amenities', amenities=', '.join(map(str, rt.amenities))[:200])
        photos = list(rt.photos.all())
        buttons = [[{'text': c.t('choose_room'), 'callback_data': f'rt:{rt.id}'}]]
        if len(photos) > 1:
            buttons.append([{'text': f"{c.t('more_photos')} ({len(photos)})", 'callback_data': f'ph:{rt.id}'}])
        markup = {'inline_keyboard': buttons}
        if photos:
            c.track((_send_photo(c, photos[0], caption[:1024], markup) or {}).get('message_id'))
        else:
            c.ask_more(caption, markup)


def ask_name_or_phone(c: Ctx):
    # Name and phone are kept on the chat for good: a returning guest (even months later)
    # goes straight to the summary. They are asked again only when the guest taps "edit".
    d = c.chat.data
    editing = bool(d.get('edit'))
    if not (c.chat.first_name and c.chat.last_name) or (editing and not d.get('got_name')):
        c.set_state('name')
        return c.ask(c.t('ask_name'), {'remove_keyboard': True})
    if not c.chat.phone or (editing and not d.get('got_phone')):
        c.set_state('phone')
        return c.ask(c.t('ask_phone'), {
            'keyboard': [[{'text': c.t('share_phone'), 'request_contact': True}]],
            'resize_keyboard': True, 'one_time_keyboard': True,
        })
    return show_summary(c)


def show_summary(c: Ctx):
    d = c.chat.data
    rt = RoomType.objects.filter(pk=d.get('rt'), hotel_id=c.bot.hotel_id).first()
    if not rt:
        return go_menu(c)
    ci, co = date.fromisoformat(d['ci']), date.fromisoformat(d['co'])
    nights = (co - ci).days
    c.set_state('confirm')
    c.ask('👇', main_menu(c.lang))  # brings the menu keyboard back after the phone button
    return c.ask_more(
        c.t('summary', hotel=c.bot.hotel.name, room_type=rt.name, check_in=svc.fmt_date(ci), check_out=svc.fmt_date(co),
            nights=nights, guests=d['guests'], name=f'{c.chat.first_name} {c.chat.last_name}'.strip(),
            phone=c.chat.phone, total=svc.stay_price_text(c.chat, rt.base_price * nights)),
        {'inline_keyboard': [
            [{'text': c.t('confirm'), 'callback_data': 'ok'}, {'text': c.t('cancel'), 'callback_data': 'no'}],
            [{'text': c.t('edit_details'), 'callback_data': 'ed'}],
        ]},
    )


def go_menu(c: Ctx, text=None):
    c.clear()
    c.set_state('')
    if not text and c.chat.first_name:
        # A guest we already know: greet them by name, their details are still on file
        text = c.t('welcome_back', hotel=c.bot.hotel.name, name=html.escape(c.chat.first_name))
    result = c.say(text or c.t('welcome', hotel=c.bot.hotel.name), main_menu(c.lang))
    offer_webapp(c)
    return result


def offer_webapp(c: Ctx):
    """An inline button that opens the Mini App (only when it has a public https address)."""
    from .webapp import webapp_url
    url = webapp_url(c.bot)
    if url:
        c.say(c.t('webapp_offer'), {'inline_keyboard': [[{'text': c.t('webapp_open'), 'web_app': {'url': url}}]]})


def my_bookings(c: Ctx):
    bookings = list(c.chat.bookings.select_related('room__room_type').order_by('-check_in')[:10])
    if not bookings:
        return c.say(c.t('my_empty'))
    c.say(c.t('my_title'))
    for b in bookings:
        c.say(*booking_card(c, b))


# ── services for a staying guest, in the chat (works without the Mini App / https) ──

def _cart(c: Ctx) -> dict:
    """{item id: quantity} kept in the chat's data until the order is sent."""
    return {int(k): int(v) for k, v in (c.chat.data.get('cart') or {}).items()}


def _save_cart(c: Ctx, cart: dict, **extra):
    c.chat.data = {**c.chat.data, 'cart': {str(k): v for k, v in cart.items() if v > 0}, **extra}
    c.chat.save(update_fields=['data', 'updated_at'])


def _price(c: Ctx, amount) -> str:
    return som(amount) if amount else c.t('rs_free')


def _limit(item) -> int:
    from apps.room_service.services import MAX_QUANTITY
    return MAX_QUANTITY if item.stock is None else min(MAX_QUANTITY, item.stock)


BACK = 'rsh'


def services_hub(c: Ctx):
    """(text, markup): what a staying guest can do — order, ask for cleaning, report a problem, see the bill."""
    from apps.room_service.services import current_stay
    stay = current_stay(c.chat)
    if not stay:
        return c.t('rs_need_stay'), None
    return c.t('hub_title', room=stay.room.room_number), {'inline_keyboard': [
        [{'text': c.t('hub_order'), 'callback_data': 'rso'}],
        [{'text': c.t('hub_cleaning'), 'callback_data': 'rqc'}, {'text': c.t('hub_repair'), 'callback_data': 'rqr'}],
        [{'text': c.t('hub_bill'), 'callback_data': 'rsbh'}],
    ]}


def room_service(c: Ctx):
    """(text, markup) of the order screen: the menu as buttons, and the cart with its total and note."""
    from apps.room_service.services import current_stay, orderable_items
    stay = current_stay(c.chat)
    if not stay:
        return c.t('rs_need_stay'), None
    items = {i.id: i for i in orderable_items(c.bot.hotel_id)}
    if not items:
        return c.t('rs_empty'), {'inline_keyboard': [[{'text': c.t('back'), 'callback_data': BACK}]]}
    # an item taken off the menu (or sold out) drops out; more than is left is cut down
    cart = {i: min(q, _limit(items[i])) for i, q in _cart(c).items() if i in items}
    rows = []
    for item in items.values():
        in_cart = f' ({cart[item.id]})' if item.id in cart else ''
        add = {'text': f'➕ {item.name} · {_price(c, item.price)}{in_cart}', 'callback_data': f'rs+:{item.id}'}
        if cart.get(item.id, 0) >= _limit(item):
            add['callback_data'] = 'noop'
        rows.append([add] + ([{'text': '➖', 'callback_data': f'rs-:{item.id}'}] if item.id in cart else []))
    text = c.t('rs_title', room=stay.room.room_number) + '\n\n'
    note = c.chat.data.get('rs_note') or ''
    if cart:
        lines = '\n'.join(f'• {html.escape(items[i].name)} × {q}' for i, q in cart.items())
        total = sum((items[i].price * q for i, q in cart.items()), 0)
        text += c.t('rs_cart', lines=lines, total=som(total))
        if note:
            text += '\n' + c.t('rs_note_line', note=html.escape(note))
        rows.append([{'text': c.t('rs_note_btn'), 'callback_data': 'rsn'}])
        rows.append([{'text': c.t('rs_clear'), 'callback_data': 'rs0'},
                     {'text': c.t('rs_send'), 'callback_data': 'rsok'}])
    else:
        text += c.t('rs_cart_empty')
    rows.append([{'text': c.t('back'), 'callback_data': BACK}])
    return text, {'inline_keyboard': rows}


def send_room_service_order(c: Ctx):
    """(text, markup) after the guest presses "send": the order, or why it was not placed."""
    from rest_framework.exceptions import ValidationError
    from apps.room_service.services import create_order
    cart = _cart(c)
    if not cart:
        return room_service(c)
    try:
        order = create_order(c.chat, [{'id': i, 'quantity': q} for i, q in cart.items()],
                             c.chat.data.get('rs_note') or '')
    except ValidationError as exc:
        return c.t('rs_failed', reason=html.escape(_detail(exc))), \
            {'inline_keyboard': [[{'text': c.t('back'), 'callback_data': 'rso'}]]}
    _save_cart(c, {}, rs_note='')
    lines = '\n'.join(f'• {html.escape(li.name)} × {li.quantity}' for li in order.lines.all())
    if order.note:
        lines += '\n' + c.t('rs_note_line', note=html.escape(order.note))
    return (c.t('rs_sent', number=order.pk, room=order.room.room_number, lines=lines, total=som(order.total)),
            {'inline_keyboard': [[{'text': c.t('rs_cancel'), 'callback_data': f'rsx:{order.pk}'}]]})


def _detail(exc) -> str:
    d = exc.detail.get('detail') if isinstance(exc.detail, dict) else exc.detail
    return str(d[0] if isinstance(d, list) and d else d)


def cancel_room_service_order(c: Ctx, order_id: int) -> str:
    from rest_framework.exceptions import ValidationError
    from apps.room_service.services import cancel_by_guest
    order = c.chat.service_orders.filter(pk=order_id).select_related('room', 'telegram_chat__bot').first()
    if not order:
        return c.t('rs_too_late')
    try:
        cancel_by_guest(order)
    except ValidationError:
        return c.t('rs_too_late')
    return c.t('rs_cancelled', number=order.pk)


def send_guest_request(c: Ctx, kind: str, text: str = '') -> str:
    from rest_framework.exceptions import ValidationError
    from apps.room_service.services import create_guest_request, current_stay
    if not current_stay(c.chat):
        return c.t('rs_need_stay')
    try:
        req = create_guest_request(c.chat, kind, text)
    except ValidationError as exc:
        return c.t('rs_failed', reason=html.escape(_detail(exc)))
    return c.t('rq_sent', number=req.pk, kind=c.t(f'gr_kind_{kind}'))


def bill_view(c: Ctx):
    """(text, markup): the guest's bill for the stay in progress, with a pay button when online payment is on."""
    from apps.room_service.services import bill, current_stay
    stay = current_stay(c.chat)
    if not stay:
        return c.t('rs_need_stay'), None
    b = bill(stay)
    parts = [c.t('bill_title', room=stay.room.room_number, reference=stay.reference),
             c.t('bill_room', nights=b['nights'], total=som(b['room_total']))]
    if b['discount']:
        parts.append(c.t('bill_discount', amount=som(b['discount'])))
    if b['room_paid']:
        parts.append(c.t('bill_paid_line', amount=som(min(b['room_paid'], b['room_total']))))
    if b['orders']:
        lines = '\n'.join(
            f"• #{o.id}: {som(o.total) if o.total else c.t('rs_free')}{' ✅' if o.is_paid else ''}" for o in b['orders'])
        parts.append(c.t('bill_orders', lines=lines))
    rows = []
    if b['due'] > 0:
        parts.append(c.t('bill_due', amount=som(b['due'])))
        if svc.payments_enabled(c.bot):
            rows.append([{'text': c.t('bill_pay_btn', amount=som(b['due'])), 'callback_data': 'rsbp'}])
        else:
            parts.append(c.t('bill_at_desk'))
    else:
        parts.append(c.t('bill_nothing'))
    rows.append([{'text': c.t('back'), 'callback_data': BACK}])
    return '\n\n'.join(parts), {'inline_keyboard': rows}


def is_open_request(b) -> bool:
    """A request the manager has not answered yet: the guest may withdraw it at once."""
    return b.status == BookingStatus.PENDING and not b.approved_at


def guest_can_cancel(c: Ctx, b) -> bool:
    """An accepted booking: the guest may ask the manager to cancel it, until the check-in day ends."""
    accepted = b.status == BookingStatus.CONFIRMED or (b.status == BookingStatus.PENDING and b.approved_at)
    return bool(accepted) and not b.cancel_requested_at and b.check_in >= svc.hotel_today(c.bot)


def booking_card(c: Ctx, b):
    st = c.t('status')
    if b.status == BookingStatus.PENDING:
        status = (
            st['to_pay'].format(due=svc.local_dt(c.bot, b.payment_due_at))
            if b.approved_at and b.payment_due_at
            else st['waiting']
        )
    else:
        status = st.get(b.status, b.status)
    if b.cancel_requested_at and b.status in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
        status += '\n' + st['cancel_pending']
    text = (f"<b>{b.reference}</b>\n🛏 {b.room.room_type.name}\n"
            f"📅 {svc.fmt_date(b.check_in)} — {svc.fmt_date(b.check_out)}\n"
            f"💰 {svc.price_text(c.bot, b.total_amount)}\n{status}")
    buttons = []
    if svc.payable(b, c.bot) and svc.payments_enabled(c.bot) and not b.cancel_requested_at:
        buttons.append([{'text': c.t('pay_btn'), 'callback_data': f'pay:{b.id}'}])
    if is_open_request(b):
        buttons.append([{'text': c.t('cancel_request'), 'callback_data': f'cx:{b.id}'}])
    elif guest_can_cancel(c, b):
        buttons.append([{'text': c.t('cancel_booking'), 'callback_data': f'cx:{b.id}'}])
    return text, ({'inline_keyboard': buttons} if buttons else None)


REVIEWS_PAGE = 5


def reviews_page(c: Ctx, offset: int = 0):
    """The hotel's guest reviews, 5 per page, newest first. Returns (text, markup)."""
    stats, reviews = svc.hotel_reviews(c.bot, offset, REVIEWS_PAGE)
    leave = [{'text': c.t('reviews_leave'), 'callback_data': 'rvl'}]
    if not stats['count']:
        return c.t('reviews_empty'), {'inline_keyboard': [leave]}
    lines = [c.t('reviews_title', hotel=html.escape(c.bot.hotel.name), avg=f"{stats['avg']:.1f}", count=stats['count'])]
    for r in reviews:
        # Privacy: first name and last-name initial only
        last = r.guest.last_name.strip()
        name = html.escape(f"{r.guest.first_name.strip()} {last[0]}." if last else r.guest.first_name.strip() or '—')
        # Keep 5 reviews well inside Telegram's 4096-character message limit
        body = r.comment if len(r.comment) <= 450 else r.comment[:450].rstrip() + '…'
        comment = html.escape(body) if body else c.t('reviews_no_comment')
        lines.append(f"{'⭐' * r.rating}  <b>{name}</b> · {svc.fmt_date(r.created_at.date())}\n{comment}")
    nav = []
    if offset > 0:
        nav.append({'text': '◀️', 'callback_data': f'rvp:{max(0, offset - REVIEWS_PAGE)}'})
    if offset + REVIEWS_PAGE < stats['count']:
        nav.append({'text': f"▶️ {offset + REVIEWS_PAGE + 1}–{min(stats['count'], offset + 2 * REVIEWS_PAGE)}",
                    'callback_data': f'rvp:{offset + REVIEWS_PAGE}'})
    rows = ([nav] if nav else []) + [leave]
    return '\n\n'.join(lines), {'inline_keyboard': rows}


def leave_review(c: Ctx):
    """Offer the stars for the guest's latest finished stay that has no rating yet."""
    b = svc.unrated_stay(c.chat)
    if not b:
        return c.say(c.t('reviews_need_stay'))
    rows = [[{'text': '⭐' * n, 'callback_data': f'rv:{b.id}:{n}'}] for n in range(5, 0, -1)]
    return c.say(
        c.t(
            'reviews_pick',
            reference=b.reference,
            check_in=svc.fmt_date(b.check_in),
            check_out=svc.fmt_date(b.check_out),
        ),
        {'inline_keyboard': rows},
    )


def contact_info(c: Ctx):
    h = c.bot.hotel
    address = ', '.join(x for x in [h.address_line1, h.city] if x)
    return c.say(c.t('contact', hotel=h.name, address=address, phone=h.phone or '—'))


# ── dispatch ────────────────────────────────────────────────────────────────

MENU = {key: {TEXTS[lang][key] for lang in TEXTS}
        for key in ('menu_book', 'menu_services', 'menu_my', 'menu_reviews', 'menu_contact', 'menu_lang')}
# Keyboards already sent to guests still show the button's earlier name
OLD_SERVICES_BUTTONS = {"🛎 Xonaga buyurtma", "🛎 Заказ в номер"}
FLOW_STATES = ('dates', 'guests', 'rooms', 'details', 'name', 'phone', 'confirm')


def _chat_for(bot: BotConfig, user: dict, chat_id: int) -> TelegramChat:
    chat, created = TelegramChat.objects.get_or_create(
        bot=bot, chat_id=chat_id,
        defaults={'username': user.get('username') or '',
                  'language': 'ru' if (user.get('language_code') or '').startswith('ru') else 'uz'},
    )
    if user.get('username') and chat.username != user['username']:
        chat.username = user['username']
        chat.save(update_fields=['username'])
    chat._is_new = created
    return chat


def start_booking(c: Ctx):
    if svc.blocked(c.chat):
        reset_dialog(c)
        return c.say(c.t('blocked'))
    pending = svc.open_request(c.chat)
    if pending:
        c.clear()
        return c.say(c.t('has_pending', reference=pending.reference))
    reset_dialog(c)  # a new booking always starts from the first question
    c.set_state('dates')
    return c.ask(*ask_checkin(c))


def reset_dialog(c: Ctx):
    """Forget the unfinished booking dialog (dates, guests, room, name/phone answers)."""
    c.clear()
    c.chat.state = ''
    c.chat.data = {}
    c.chat.save(update_fields=['state', 'data', 'updated_at'])


def on_message(bot: BotConfig, msg: dict):
    if msg.get('chat', {}).get('type') != 'private':
        return
    chat = _chat_for(bot, msg.get('from', {}), msg['chat']['id'])
    c = Ctx(bot, chat)

    if 'successful_payment' in msg:
        return svc.handle_successful_payment(bot, chat, msg['successful_payment'])

    # The guest's answers during booking go away together with the question
    if chat.state in FLOW_STATES:
        c.track(msg.get('message_id'))

    if 'contact' in msg and chat.state == 'phone':
        contact = msg['contact']
        if contact.get('user_id') and contact['user_id'] != msg.get('from', {}).get('id'):
            return c.ask_more(c.t('phone_own'))
        phone = contact.get('phone_number', '')
        chat.phone = phone if phone.startswith('+') else f'+{phone}'
        chat.save(update_fields=['phone'])
        c.set_state(chat.state, got_phone=True)
        return show_summary(c)

    text = (msg.get('text') or '').strip()
    if text.startswith('/start'):
        # e.g. the guest cleared the chat mid-booking: start over from the language question
        reset_dialog(c)
        c.track(msg.get('message_id'))
        return c.ask(TEXTS['uz']['choose_lang'], lang_keyboard())
    if text in MENU['menu_book'] or text == '/book':
        c.track(msg.get('message_id'))
        return start_booking(c)
    if text in MENU['menu_services'] or text in OLD_SERVICES_BUTTONS:
        c.clear()
        c.set_state('')
        return c.say(*services_hub(c))
    if text == '/order':
        c.clear()
        c.set_state('')
        return c.say(*room_service(c))
    if text in MENU['menu_my']:
        c.clear()
        c.set_state('')
        return my_bookings(c)
    if text in MENU['menu_reviews'] or text == '/reviews':
        c.clear()
        c.set_state('')
        return c.say(*reviews_page(c))
    if text in MENU['menu_contact']:
        c.clear()
        c.set_state('')
        return contact_info(c)
    if text in MENU['menu_lang']:
        c.track(msg.get('message_id'))
        c.set_state('')
        return c.ask(TEXTS['uz']['choose_lang'], lang_keyboard())

    if chat.state == 'rs_note' and text:
        c.set_state('', rs_note=text[:300])
        return c.say(*room_service(c))
    if chat.state == 'rq_repair' and text:
        c.set_state('')
        return c.say(send_guest_request(c, 'repair', text), main_menu(c.lang))
    if chat.state == 'review' and text:
        svc.save_review_comment(chat, int(chat.data.get('rv') or 0), text)
        c.set_state('', rv=None)
        return c.say(c.t('review_thanks'), main_menu(c.lang))
    if chat.state == 'name' and text:
        parts = text.split()
        if len(parts) < 2 or len(text) > 100:
            return c.ask_more(c.t('bad_name'))
        chat.first_name, chat.last_name = parts[0][:150], ' '.join(parts[1:])[:150]
        chat.save(update_fields=['first_name', 'last_name'])
        c.set_state(chat.state, got_name=True)
        return ask_name_or_phone(c)
    if chat.state == 'phone':
        return ask_name_or_phone(c)
    if chat.state == 'guests' and chat.data.get('co') and text:
        if not text.isdigit() or not 1 <= int(text) <= MAX_TYPED_GUESTS:
            return c.ask_more(c.t('bad_guests'))
        return choose_guests(c, int(text))
    return c.say(c.t('unknown'), main_menu(c.lang))


def on_services_button(c: Ctx, data: str, edit):
    """Buttons of the staying guest's services: hub, order screen, note, requests, bill."""
    if data == 'rs':  # from the check-in message: a new message, the welcome stays
        return c.say(*services_hub(c))
    if data == BACK:
        c.set_state('')
        return edit(*services_hub(c))
    if data == 'rso':
        return edit(*room_service(c))
    if data.startswith(('rs+:', 'rs-:')):
        cart, item_id = _cart(c), int(data[4:])
        cart[item_id] = max(0, cart.get(item_id, 0) + (1 if data[2] == '+' else -1))
        _save_cart(c, cart)
        return edit(*room_service(c))  # the screen also cuts the quantity to what is left in stock
    if data == 'rs0':
        _save_cart(c, {}, rs_note='')
        return edit(*room_service(c))
    if data == 'rsn':
        c.set_state('rs_note')
        return c.say(c.t('rs_note_ask'))
    if data == 'rsok':
        return edit(*send_room_service_order(c))
    if data.startswith('rsx:'):
        return edit(cancel_room_service_order(c, int(data[4:])))
    if data == 'rsb':  # from the check-out reminder: a new message, the reminder stays
        return c.say(*bill_view(c))
    if data == 'rsbh':  # from the hub: in place
        return edit(*bill_view(c))
    if data == 'rsbp':
        from apps.room_service.services import bill, current_stay
        stay = current_stay(c.chat)
        if stay and bill(stay)['due'] > 0 and svc.payments_enabled(c.bot):
            try:
                svc.send_bill_invoice(stay)
            except TelegramError as exc:
                logger.warning('Bill invoice failed: %s', exc)
                c.say(c.t('precheckout_fail'))
        return
    if data == 'rqc':
        return edit(c.t('rq_cleaning_ask'), {'inline_keyboard': [
            [{'text': c.t('rq_cleaning_yes'), 'callback_data': 'rqc!'}],
            [{'text': c.t('back'), 'callback_data': BACK}]]})
    if data == 'rqc!':
        return edit(send_guest_request(c, 'cleaning'))
    if data == 'rqr':
        from apps.room_service.services import current_stay
        if not current_stay(c.chat):
            return edit(c.t('rs_need_stay'))
        c.set_state('rq_repair')
        return c.say(c.t('rq_repair_ask'))


def on_callback(bot: BotConfig, cq: dict):
    msg = cq.get('message') or {}
    chat = _chat_for(bot, cq.get('from', {}), msg.get('chat', {}).get('id') or cq['from']['id'])
    c = Ctx(bot, chat)
    data = cq.get('data') or ''
    try:
        c.api.call('answerCallbackQuery', callback_query_id=cq['id'])
    except TelegramError:
        pass

    def edit(text, markup=None):
        try:
            c.api.call('editMessageText', chat_id=chat.chat_id, message_id=msg.get('message_id'),
                       text=text, parse_mode='HTML', reply_markup=markup)
        except TelegramError:
            c.say(text, markup)

    if data == 'noop':
        return
    # A button that answers a booking question: that question message goes away with the next one
    if data in ('book', 'ok', 'no', 'ed') or data.startswith(('lang:', 'in:', 'out:', 'g:', 'rt:')):
        c.track(msg.get('message_id'))

    if data.startswith('lang:'):
        chat.language = 'ru' if data == 'lang:ru' else 'uz'
        chat.save(update_fields=['language'])
        c.lang = chat.language
        return go_menu(c)
    if data == 'book':
        c.set_state('dates')
        return c.ask(*ask_checkin(c))
    if data.startswith('cal:in:'):
        return edit(*ask_checkin(c, data[7:]))  # month arrows: same question, new page
    if data.startswith('cal:out:') and chat.data.get('ci'):
        return edit(*ask_checkout(c, data[8:]))
    if data.startswith('in:'):
        c.set_state('dates', ci=data[3:], co=None)
        return c.ask(*ask_checkout(c))
    if data.startswith('out:') and chat.data.get('ci'):
        ci, co = date.fromisoformat(chat.data['ci']), date.fromisoformat(data[4:])
        if not (ci < co <= ci + timedelta(days=svc.MAX_NIGHTS)):
            return c.ask_more(c.t('night_limit', n=svc.MAX_NIGHTS))
        c.set_state('guests', co=co.isoformat())
        return c.ask(c.t('pick_guests', check_in=svc.fmt_date(ci), check_out=svc.fmt_date(co), nights=(co - ci).days),
                     guests_keyboard(c.lang, max_occupancy(bot)))
    if data.startswith('g:') and chat.data.get('co'):
        return choose_guests(c, int(data[2:]))
    if data.startswith('ph:'):
        rt = RoomType.objects.filter(pk=int(data[3:]), hotel_id=bot.hotel_id).first()
        if rt:
            for p in list(rt.photos.all())[1:10]:
                c.track((_send_photo(c, p) or {}).get('message_id'))
            c.ask_more(
                f'<b>{rt.name}</b>',
                {'inline_keyboard': [[{'text': c.t('choose_room'), 'callback_data': f'rt:{rt.id}'}]]},
            )
        return
    if data.startswith('rt:') and chat.data.get('guests'):
        if svc.open_request(chat):
            return start_booking(c)
        c.set_state('details', rt=int(data[3:]))
        return ask_name_or_phone(c)
    if data.startswith('rv:'):
        _, booking_id, rating = data.split(':')
        if svc.save_rating(chat, int(booking_id), int(rating)):
            c.set_state('review', rv=int(booking_id))
            return edit(c.t('review_comment', stars='⭐' * int(rating)),
                        {'inline_keyboard': [[{'text': c.t('review_skip'), 'callback_data': 'rvs'}]]})
        return edit(c.t('review_done'))
    if data.startswith('rs') or data.startswith('rq'):
        return on_services_button(c, data, edit)
    if data.startswith('rvp:'):
        return edit(*reviews_page(c, max(0, int(data[4:]))))  # next/previous page in place
    if data == 'rvl':
        return leave_review(c)
    if data == 'rvs':
        c.set_state('', rv=None)
        return edit(c.t('review_thanks'))
    if data == 'ok' and chat.state == 'confirm':
        d = chat.data
        if svc.blocked(chat):
            return start_booking(c)  # tells the guest booking is not possible
        if svc.open_request(chat):
            return start_booking(c)
        booking = svc.create_request(
            chat, int(d['rt']), date.fromisoformat(d['ci']), date.fromisoformat(d['co']), int(d['guests'])
        )
        c.clear()
        if not booking:
            c.say(c.t('room_taken'))
            return start_booking(c)
        c.set_state('', ci=None, co=None, guests=None, rt=None)
        return c.say(c.t('request_sent', reference=booking.reference))  # result: stays in the chat
    if data == 'ed' and chat.state == 'confirm':
        # Change the saved name / phone: ask both again, then back to the summary
        c.set_state('details', edit=True, got_name=False, got_phone=False)
        return ask_name_or_phone(c)
    if data == 'no':
        c.clear()
        c.set_state('')
        return c.say(c.t('cancelled_flow'))
    if data.startswith('pay:'):
        b = (
            chat.bookings.filter(pk=int(data[4:]))
            .select_related('room__room_type', 'telegram_chat__bot__hotel')
            .first()
        )
        if b and svc.payable(b, bot) and svc.payments_enabled(bot):
            try:
                svc.send_invoice(b)
            except TelegramError as exc:
                logger.warning('Invoice resend failed: %s', exc)
        else:
            c.say(c.t('precheckout_fail'))
        return
    if data.startswith(('cx:', 'cxy:', 'cxn:')):
        kind, _, pk = data.partition(':')
        b = chat.bookings.filter(pk=int(pk)).select_related('room__room_type').first()
        if not b:
            return
        if is_open_request(b) and kind == 'cx':
            # The manager has not answered yet: nothing to decide, withdraw right away
            svc.withdraw_request(b)
            return edit(c.t('request_cancelled', reference=b.reference))
        if kind == 'cxn' or b.cancel_requested_at or b.status not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
            return edit(*booking_card(c, b))  # kept, already asked, or changed elsewhere: show it as it is now
        if not guest_can_cancel(c, b):
            return edit(c.t('cancel_too_late'))
        if kind == 'cx':
            return edit(
                c.t(
                    'cancel_ask',
                    reference=b.reference,
                    check_in=svc.fmt_date(b.check_in),
                    check_out=svc.fmt_date(b.check_out),
                ),
                {
                    'inline_keyboard': [
                        [
                            {'text': c.t('cancel_yes'), 'callback_data': f'cxy:{b.id}'},
                            {'text': c.t('cancel_no'), 'callback_data': f'cxn:{b.id}'},
                        ]
                    ]
                },
            )
        svc.request_cancel(b)  # kind == 'cxy': the manager decides in the panel
        return edit(c.t('cancel_sent', reference=b.reference))


def handle_update(bot: BotConfig, update: dict):
    """Entry point for both the webhook and long polling. Never raises."""
    try:
        svc.expire_stale(bot.hotel_id)
        if 'message' in update:
            on_message(bot, update['message'])
        elif 'callback_query' in update:
            on_callback(bot, update['callback_query'])
        elif 'pre_checkout_query' in update:
            svc.handle_pre_checkout(bot, update['pre_checkout_query'])
    except Exception:
        logger.exception('Telegram update failed for bot %s: %s', bot.pk, update.get('update_id'))
