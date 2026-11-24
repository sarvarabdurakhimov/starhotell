"""Booking business logic — all reservation operations run in transactions."""
import logging
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.rooms.models import Room
from .models import Booking, BookingAuditLog, BookingStatus

logger = logging.getLogger(__name__)


def check_room_availability(room_id: int, check_in: date, check_out: date, exclude_booking_id: int = None) -> bool:
    """
    Check if a room is available for the given date range.
    Interval: [check_in, check_out) — departure date is not occupied.
    Cancelled and no-show bookings do NOT block availability.
    """
    qs = Booking.objects.filter(
        room_id=room_id,
        status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
    ).filter(
        check_in__lt=check_out,
        check_out__gt=check_in,
    )
    if exclude_booking_id:
        qs = qs.exclude(pk=exclude_booking_id)
    return not qs.exists()


def loyalty_percent(hotel_id: int, guest_id) -> Decimal:
    """The returning-guest discount (%) this guest has earned at this hotel, or 0.

    Earned after the hotel's set number of finished stays (checked out); 0 stays in the settings = off.
    """
    from apps.hotels.models import HotelSettings
    s = HotelSettings.objects.filter(hotel_id=hotel_id).first()
    if not guest_id or not s or not s.loyalty_min_stays or s.loyalty_discount_percent <= 0:
        return Decimal('0')
    stays = Booking.objects.filter(hotel_id=hotel_id, guest_id=guest_id, status=BookingStatus.CHECKED_OUT).count()
    return Decimal(s.loyalty_discount_percent) if stays >= s.loyalty_min_stays else Decimal('0')


def loyalty_discount(hotel_id: int, guest_id, amount: Decimal) -> Decimal:
    """So'm taken off `amount` for a returning guest (whole so'm)."""
    pct = loyalty_percent(hotel_id, guest_id)
    return (Decimal(amount) * pct / 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP) if pct else Decimal('0')


@transaction.atomic
def create_booking(
    hotel_id: int,
    room_id: int,
    guest_id: int,
    check_in: date,
    check_out: date,
    num_adults: int,
    num_children: int,
    special_requests: str,
    created_by,
    status: str = BookingStatus.CONFIRMED,
    source: str = 'panel',
    telegram_chat=None,
) -> Booking:
    """
    Create a new booking with concurrency protection.
    Uses SELECT FOR UPDATE on the room row to serialize concurrent booking requests.
    """
    try:
        room = Room.objects.select_for_update().get(pk=room_id, hotel_id=hotel_id)
    except Room.DoesNotExist:
        raise ValidationError({'room': 'Room not found in this hotel.'})

    if not check_room_availability(room_id, check_in, check_out):
        raise ValidationError({'detail': 'Room is not available for the selected dates.'})

    from apps.guests.models import Guest
    try:
        guest = Guest.objects.get(pk=guest_id, hotel_id=hotel_id)
    except Guest.DoesNotExist:
        raise ValidationError({'guest': 'Guest not found in this hotel.'})

    nights = (check_out - check_in).days
    rate = room.room_type.base_price
    discount = loyalty_discount(hotel_id, guest.id, rate * nights)
    total = rate * nights - discount

    booking = Booking.objects.create(
        hotel_id=hotel_id,
        room=room,
        guest=guest,
        created_by=created_by,
        check_in=check_in,
        check_out=check_out,
        num_adults=num_adults,
        num_children=num_children,
        rate_per_night=rate,
        total_amount=total,
        discount_amount=discount,
        currency=room.hotel.currency,
        special_requests=special_requests,
        status=status,
        source=source,
        telegram_chat=telegram_chat,
    )

    BookingAuditLog.objects.create(
        booking=booking,
        changed_by=created_by,
        old_status='',
        new_status=status,
        notes='Booking request from Telegram.' if source == 'telegram' else 'Booking created.',
    )

    logger.info('Booking %s created for room %s hotel %s', booking.reference, room_id, hotel_id)
    return booking


@transaction.atomic
def transition_booking(booking: Booking, new_status: str, changed_by, notes: str = '') -> Booking:
    """Transition a booking to a new status, enforcing allowed transitions."""
    if not booking.can_transition_to(new_status):
        raise ValidationError(
            {'detail': f'Cannot transition booking from {booking.status} to {new_status}.'}
        )

    old_status = booking.status
    booking.status = new_status

    if new_status == BookingStatus.CHECKED_IN:
        booking.actual_check_in = datetime.now(tz=timezone.utc)
    elif new_status == BookingStatus.CHECKED_OUT:
        booking.actual_check_out = datetime.now(tz=timezone.utc)

    booking.save()

    # Keep the room status in step with the stay.
    from apps.rooms.models import RoomStatus
    room = booking.room
    if new_status == BookingStatus.CHECKED_IN:
        room.status = RoomStatus.OCCUPIED
        room.save(update_fields=['status'])
    elif new_status == BookingStatus.CHECKED_OUT:
        room.status = RoomStatus.CLEANING
        room.save(update_fields=['status'])
        from apps.housekeeping.models import HousekeepingTask, HousekeepingStatus
        HousekeepingTask.objects.create(
            hotel_id=booking.hotel_id,
            room=room,
            status=HousekeepingStatus.DIRTY,
            notes=f'Check-out: {booking.reference}',
        )

    BookingAuditLog.objects.create(
        booking=booking,
        changed_by=changed_by,
        old_status=old_status,
        new_status=new_status,
        notes=notes,
    )

    logger.info(
        'Booking %s transitioned %s -> %s by %s',
        booking.reference,
        old_status,
        new_status,
        changed_by.email if changed_by else 'system',
    )
    return booking
