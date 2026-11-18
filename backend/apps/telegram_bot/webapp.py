"""Telegram Mini App (Web App) API: the same booking flow as the chat bot, in a web page inside Telegram.

The page is opened from the hotel's bot and sends Telegram's signed `initData` in the
X-Telegram-Init-Data header. It is checked with the bot's token (HMAC, per Telegram's docs),
so the guest is identified by Telegram itself - there is no login.
"""
import hashlib
import html
import hmac
import json
import re
import time
from datetime import date, timedelta
from urllib.parse import parse_qsl

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.bookings.models import BookingStatus
from apps.rooms.models import RoomType

from . import services as svc
from .api import TelegramError
from .models import BotConfig, TelegramChat
from .texts import t as bot_text


def t(lang, key, **kw):
    """The chat bot's text without its HTML tags: the web page shows plain text."""
    value = bot_text(lang, key, **kw)
    if isinstance(value, str):
        return html.unescape(re.sub(r'<[^>]+>', '', value))
    return value


INIT_DATA_MAX_AGE = 24 * 3600  # a page opened yesterday must be reopened from the bot
MAX_GUESTS = 50


# ── Telegram initData ───────────────────────────────────────────────────────

def verify_init_data(init_data: str, bot_token: str, max_age: int = INIT_DATA_MAX_AGE) -> dict:
    """Return the Telegram user from a Mini App's initData, or raise AuthenticationFailed.

    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not init_data:
        raise AuthenticationFailed('Telegram ichida oching.')
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    given = fields.pop('hash', '')
    check_string = '\n'.join(f'{k}={v}' for k, v in sorted(fields.items()))
    secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not given or not hmac.compare_digest(given, expected):
        raise AuthenticationFailed("Telegram ma'lumoti tasdiqlanmadi.")
    try:
        auth_date = int(fields.get('auth_date', '0'))
        user = json.loads(fields.get('user') or '{}')
    except ValueError:
        raise AuthenticationFailed("Telegram ma'lumoti noto'g'ri.")
    if time.time() - auth_date > max_age:
        raise AuthenticationFailed("Sahifa eskirgan: ilovani botdan qayta oching.")
    if not user.get('id'):
        raise AuthenticationFailed("Telegram foydalanuvchisi topilmadi.")
    return user


def webapp_url(bot: BotConfig) -> str:
    """Public https address of the Mini App for this bot; '' when there is none (Telegram requires https)."""
    base = (getattr(settings, 'TELEGRAM_WEBAPP_URL', '') or settings.FRONTEND_URL or '').rstrip('/')
    return f'{base}/tg/{bot.id}' if base.startswith('https://') else ''


# ── shared view plumbing ────────────────────────────────────────────────────

class WebAppThrottle(ScopedRateThrottle):
    """Per-client limit; off where no rate is configured (development disables throttling)."""

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope)


class WebAppView(APIView):
    """Resolves the bot from the URL and the guest's chat from the signed initData."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [WebAppThrottle]
    throttle_scope = 'telegram_webapp'

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.bot = (BotConfig.objects.filter(pk=kwargs['bot_id'], is_active=True)
                    .select_related('hotel', 'hotel__settings').first())
        if not self.bot:
            raise AuthenticationFailed('Bot topilmadi.')
        user = verify_init_data(request.headers.get('X-Telegram-Init-Data', ''), self.bot.token)
        # In a private chat the chat id is the user id, so this is the same record the chat bot uses
        self.chat, created = TelegramChat.objects.get_or_create(
            bot=self.bot, chat_id=int(user['id']),
            defaults={'username': user.get('username') or '',
                      'language': 'ru' if (user.get('language_code') or '').startswith('ru') else 'uz',
                      'first_name': (user.get('first_name') or '')[:150],
                      'last_name': (user.get('last_name') or '')[:150]},
        )
        if not created and user.get('username') and self.chat.username != user['username']:
            self.chat.username = user['username']
            self.chat.save(update_fields=['username'])
        self.lang = self.chat.language


def _max_advance(bot) -> int:
    s = getattr(bot.hotel, 'settings', None)
    return getattr(s, 'max_advance_booking_days', 365) or 365


def _parse_stay(bot, data) -> tuple:
    """(check_in, check_out, guests) from request data, checked like the chat bot's calendar."""
    try:
        ci = date.fromisoformat(str(data.get('check_in')))
        co = date.fromisoformat(str(data.get('check_out')))
        guests = int(data.get('guests') or 1)
    except (TypeError, ValueError):
        raise ValidationError({'detail': "Sana yoki mehmonlar soni noto'g'ri."})
    today = svc.hotel_today(bot)
    if ci < today:
        raise ValidationError({'detail': "Kelish sanasi o'tib ketgan."})
    if ci > today + timedelta(days=_max_advance(bot)):
        raise ValidationError({'detail': "Bu sana uchun hali bron ochilmagan."})
    if not ci < co <= ci + timedelta(days=svc.MAX_NIGHTS):
        raise ValidationError({'detail': f"Ketish sanasi kelishdan keyin, ko'pi bilan {svc.MAX_NIGHTS} kecha."})
    if not 1 <= guests <= MAX_GUESTS:
        raise ValidationError({'detail': "Mehmonlar soni noto'g'ri."})
    return ci, co, guests


def _photos(rt: RoomType) -> list:
    from apps.rooms.views import photo_url
    return [photo_url(p.id) for p in rt.photos.all()]


def _room_type(bot, rt: RoomType, nights: int = 0) -> dict:
    return {
        'id': rt.id, 'name': rt.name, 'description': rt.description, 'max_occupancy': rt.max_occupancy,
        'amenities': [str(a) for a in (rt.amenities or [])],
        'price_per_night': svc.uzs_amount(bot, rt.base_price),
        'total': svc.uzs_amount(bot, rt.base_price * nights) if nights else None,
        'photos': _photos(rt),
    }


def _is_open_request(b) -> bool:
    return b.status == BookingStatus.PENDING and not b.approved_at


def _can_ask_cancel(bot, b) -> bool:
    accepted = b.status == BookingStatus.CONFIRMED or (b.status == BookingStatus.PENDING and b.approved_at)
    return bool(accepted) and not b.cancel_requested_at and b.check_in >= svc.hotel_today(bot)


def _booking(bot, lang, b) -> dict:
    st = t(lang, 'status')
    if b.status == BookingStatus.PENDING:
        text = (st['to_pay'].format(due=svc.local_dt(bot, b.payment_due_at))
                if b.approved_at and b.payment_due_at else st['waiting'])
    else:
        text = st.get(b.status, b.status)
    cancel_pending = bool(b.cancel_requested_at) and b.status in (BookingStatus.PENDING, BookingStatus.CONFIRMED)
    return {
        'id': b.id, 'reference': b.reference, 'room_type': b.room.room_type.name,
        'check_in': b.check_in.isoformat(), 'check_out': b.check_out.isoformat(),
        'nights': (b.check_out - b.check_in).days, 'guests': b.num_adults + b.num_children,
        'total': svc.uzs_amount(bot, b.total_amount), 'status': b.status, 'status_text': text,
        'cancel_pending': cancel_pending,
        'can_pay': svc.payable(b, bot) and svc.payments_enabled(bot) and not b.cancel_requested_at,
        'can_withdraw': _is_open_request(b),
        'can_ask_cancel': _can_ask_cancel(bot, b),
    }


def _profile(chat) -> dict:
    return {'first_name': chat.first_name, 'last_name': chat.last_name, 'phone': chat.phone,
            'language': chat.language}


# ── endpoints ───────────────────────────────────────────────────────────────

class InfoView(WebAppView):
    """GET .../webapp/{bot_id}/info/: hotel, room types, saved guest details, booking limits."""

    def get(self, request, bot_id):
        bot, h = self.bot, self.bot.hotel
        svc.expire_stale(bot.hotel_id)
        types = RoomType.objects.filter(hotel_id=bot.hotel_id).prefetch_related('photos').order_by('base_price')
        today = svc.hotel_today(bot)
        pending = svc.open_request(self.chat)
        return Response({
            'hotel': {'name': h.name, 'address': ', '.join(x for x in [h.address_line1, h.city] if x),
                      'phone': h.phone or '', 'currency': 'UZS'},
            'today': today.isoformat(),
            'last_check_in': (today + timedelta(days=_max_advance(bot))).isoformat(),
            'max_nights': svc.MAX_NIGHTS,
            'max_guests': max([rt.max_occupancy for rt in types] or [1]),
            'room_types': [_room_type(bot, rt) for rt in types],
            'profile': _profile(self.chat),
            'blocked': svc.blocked(self.chat),
            'open_request': pending.reference if pending else None,
        })


class AvailabilityView(WebAppView):
    """GET .../webapp/{bot_id}/availability/?check_in=&check_out=&guests=: free room types and totals."""

    def get(self, request, bot_id):
        ci, co, guests = _parse_stay(self.bot, request.query_params)
        svc.expire_stale(self.bot.hotel_id)
        nights = (co - ci).days
        types = svc.available_room_types(self.bot.hotel_id, ci, co, guests)
        return Response({'nights': nights, 'room_types': [_room_type(self.bot, rt, nights) for rt in types]})


PHONE_RE = re.compile(r'^\+?\d{9,15}$')


class BookView(WebAppView):
    """POST .../webapp/{bot_id}/book/: create a booking request, exactly like the chat bot's "Confirm"."""

    def post(self, request, bot_id):
        bot, chat, d = self.bot, self.chat, request.data
        if svc.blocked(chat):
            return Response({'detail': t(self.lang, 'blocked')}, status=status.HTTP_403_FORBIDDEN)
        pending = svc.open_request(chat)
        if pending:
            return Response({'detail': t(self.lang, 'has_pending', reference=pending.reference)},
                            status=status.HTTP_409_CONFLICT)
        ci, co, guests = _parse_stay(bot, d)
        rt = RoomType.objects.filter(pk=d.get('room_type_id'), hotel_id=bot.hotel_id).first()
        if not rt:
            raise ValidationError({'detail': 'Xona turi topilmadi.'})
        if guests > rt.max_occupancy:
            raise ValidationError({'detail': f"Bu xonaga ko'pi bilan {rt.max_occupancy} kishi sig'adi."})

        first, last = str(d.get('first_name') or '').strip(), str(d.get('last_name') or '').strip()
        phone = re.sub(r'[\s()-]', '', str(d.get('phone') or ''))
        if not first or not last or len(first) > 150 or len(last) > 150:
            raise ValidationError({'detail': 'Ism va familiyani yozing.'})
        if not PHONE_RE.match(phone):
            raise ValidationError({'detail': "Telefon raqamini to'liq yozing, masalan: +998901234567"})
        chat.first_name, chat.last_name = first, last
        chat.phone = phone if phone.startswith('+') else f'+{phone}'
        chat.save(update_fields=['first_name', 'last_name', 'phone'])
        if svc.blocked(chat):  # the phone may match a blacklisted guest card
            return Response({'detail': t(self.lang, 'blocked')}, status=status.HTTP_403_FORBIDDEN)

        svc.expire_stale(bot.hotel_id)
        booking = svc.create_request(chat, rt.id, ci, co, guests)
        if not booking:
            return Response({'detail': t(self.lang, 'room_taken')}, status=status.HTTP_409_CONFLICT)
        try:  # the same confirmation the chat bot sends, so the guest sees it in the chat too
            svc.send(bot, chat.chat_id, t(self.lang, 'request_sent', reference=booking.reference))
        except TelegramError:
            pass
        return Response(_booking(bot, self.lang, booking), status=status.HTTP_201_CREATED)


class MyBookingsView(WebAppView):
    """GET .../webapp/{bot_id}/bookings/: the guest's last 20 bookings made through this bot."""

    def get(self, request, bot_id):
        svc.expire_stale(self.bot.hotel_id)
        qs = self.chat.bookings.select_related('room__room_type').order_by('-check_in')[:20]
        return Response([_booking(self.bot, self.lang, b) for b in qs])


class BookingActionView(WebAppView):
    """POST .../webapp/{bot_id}/bookings/{pk}/{cancel|pay}/"""

    def post(self, request, bot_id, pk, action):
        if action not in ('cancel', 'pay'):
            return Response(status=status.HTTP_404_NOT_FOUND)
        b = self.chat.bookings.filter(pk=pk).select_related('room__room_type', 'telegram_chat__bot__hotel').first()
        if not b:
            return Response({'detail': 'Bron topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        if action == 'cancel':
            if _is_open_request(b):
                svc.withdraw_request(b)  # nobody answered yet: cancelled at once
            elif _can_ask_cancel(self.bot, b):
                svc.request_cancel(b)  # accepted: the manager decides in the panel
            else:
                return Response({'detail': t(self.lang, 'cancel_too_late')}, status=status.HTTP_400_BAD_REQUEST)
        elif action == 'pay':
            if not (svc.payable(b, self.bot) and svc.payments_enabled(self.bot)):
                return Response({'detail': t(self.lang, 'precheckout_fail')}, status=status.HTTP_400_BAD_REQUEST)
            try:
                svc.send_invoice(b)  # the invoice arrives in the chat; Telegram handles the payment
            except TelegramError:
                return Response({'detail': "To'lovni yuborib bo'lmadi, keyinroq urinib ko'ring."},
                                status=status.HTTP_502_BAD_GATEWAY)
        b.refresh_from_db()
        return Response(_booking(self.bot, self.lang, b))
