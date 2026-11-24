"""Add demo guests and bookings around today so room pages have something to show.

Creates guests who are staying now (leaving today / tomorrow / later), guests arriving
today and in the coming days, and a few past stays. Dates are relative to today.
Safe to run more than once: rooms that already have a planned booking are skipped.

    python manage.py add_demo_stays
    python manage.py add_demo_stays --hotel 3
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.bookings.models import Booking, BookingAuditLog, BookingStatus
from apps.guests.models import Guest
from apps.hotels.models import Hotel
from apps.housekeeping.models import HousekeepingStatus, HousekeepingTask
from apps.payments.models import Payment, PaymentStatus
from apps.rooms.models import Room, RoomStatus

# (room, first, last, phone, nationality, vip, start offset, end offset, kind, paid share, request)
# kind: "stay" = checked in now, "arrival" = confirmed, "past" = checked out
STAYS = [
    ('102', 'Jasur', 'Toshmatov', '+998901112233', 'Uzbekistan', False, -3, 0, 'stay', '1', ''),
    ('203', 'Anna', 'Schmidt', '+4915123456789', 'Germany', False, -2, 0, 'stay', '0.5', 'Late check-out if possible'),
    ('301', 'Kenji', 'Tanaka', '+819012345678', 'Japan', True, -1, 1, 'stay', '1', 'Extra pillows'),
    ('303', 'Dilnoza', 'Rahimova', '+998935556677', 'Uzbekistan', False, -4, 2, 'stay', '0', 'Baby cot'),
    (
        '403',
        'James',
        'Carter',
        '+447700900123',
        'United Kingdom',
        True,
        -2,
        4,
        'stay',
        '1',
        'Airport transfer on departure',
    ),
    ('205', 'Bobur', 'Aliyev', '+998977778899', 'Uzbekistan', False, -5, 3, 'stay', '0.3', ''),
    ('102', 'Elena', 'Petrova', '+79161234567', 'Russia', False, 0, 3, 'arrival', '0', 'Arriving around 18:00'),
    ('104', 'Sardor', 'Karimov', '+998991234567', 'Uzbekistan', False, 0, 2, 'arrival', '0', ''),
    ('206', 'Marie', 'Dubois', '+33612345678', 'France', False, 0, 4, 'arrival', '0', 'Vegetarian breakfast'),
    ('302', 'Ali', 'Hassan', '+971501234567', 'UAE', True, 1, 5, 'arrival', '0', ''),
    ('401', 'Nodira', 'Usmonova', '+998946667788', 'Uzbekistan', False, 2, 6, 'arrival', '0', 'Family with 2 kids'),
    ('203', 'Lukas', 'Novak', '+420601234567', 'Czechia', False, 3, 5, 'arrival', '0', ''),
    ('103', 'Aziz', 'Qodirov', '+998901234321', 'Uzbekistan', False, -9, -6, 'past', '1', ''),
    ('103', 'Sophie', 'Martin', '+33698765432', 'France', False, -5, -2, 'past', '1', ''),
    ('202', 'Chen', 'Wei', '+8613812345678', 'China', False, -12, -8, 'past', '1', ''),
    ('301', 'Olga', 'Ivanova', '+79031234567', 'Russia', False, -8, -3, 'past', '1', ''),
]


class Command(BaseCommand):
    help = 'Adds demo guests and bookings (current stays, arrivals, past stays) relative to today.'

    def add_arguments(self, parser):
        parser.add_argument('--hotel', type=int, help='Hotel id (default: first hotel)')

    @transaction.atomic
    def handle(self, *args, **options):
        hotel_id = options.get('hotel')
        hotel = Hotel.objects.filter(id=hotel_id).first() if hotel_id else Hotel.objects.order_by('id').first()
        if not hotel:
            raise CommandError('Hotel not found.')

        today = timezone.localdate()
        tz = timezone.get_current_timezone()
        added = skipped = 0

        for (number, first, last, phone, nationality, vip, start, end, kind, paid_share, request) in STAYS:
            room = Room.objects.select_related('room_type').filter(hotel=hotel, room_number=number).first()
            if not room:
                self.stdout.write(self.style.WARNING(f'Room {number} not found, run add_demo_rooms first.'))
                continue

            check_in, check_out = today + timedelta(days=start), today + timedelta(days=end)

            overlapping = Booking.objects.filter(
                room=room,
                status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED,
                            BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
                check_in__lt=check_out, check_out__gt=check_in,
            ).exists()
            if overlapping or (kind == 'stay' and Booking.objects.filter(
                    room=room, status=BookingStatus.CHECKED_IN).exists()):
                skipped += 1
                continue

            guest, _ = Guest.objects.get_or_create(
                hotel=hotel, first_name=first, last_name=last,
                defaults={'phone': phone, 'nationality': nationality, 'is_vip': vip},
            )
            nights = (check_out - check_in).days
            rate = room.room_type.base_price
            status = {'stay': BookingStatus.CHECKED_IN, 'arrival': BookingStatus.CONFIRMED,
                      'past': BookingStatus.CHECKED_OUT}[kind]
            booking = Booking.objects.create(
                hotel=hotel, room=room, guest=guest, status=status,
                check_in=check_in, check_out=check_out,
                num_adults=2 if room.room_type.max_occupancy > 1 else 1,
                num_children=2 if 'kids' in request else 0,
                rate_per_night=rate, total_amount=rate * nights, currency=hotel.currency,
                special_requests=request,
                actual_check_in=(datetime.combine(check_in, time(14, 0), tz) if kind != 'arrival' else None),
                actual_check_out=(datetime.combine(check_out, time(11, 0), tz) if kind == 'past' else None),
            )
            BookingAuditLog.objects.create(booking=booking, old_status='', new_status=status, notes='Demo data.')

            share = Decimal(paid_share)
            if share > 0:
                Payment.objects.create(
                    booking=booking, hotel=hotel, status=PaymentStatus.SUCCEEDED,
                    amount=(booking.total_amount * share).quantize(Decimal('0.01')),
                    currency=hotel.currency, provider='cash', processed_at=timezone.now(),
                )

            if kind == 'stay':
                room.status = RoomStatus.OCCUPIED
                room.save(update_fields=['status'])
            elif kind == 'past':
                HousekeepingTask.objects.create(
                    hotel=hotel, room=room, status=HousekeepingStatus.INSPECTED,
                    notes=f'Check-out: {booking.reference}',
                    completed_at=datetime.combine(check_out, time(13, 0), tz),
                )
            added += 1

        self.stdout.write(self.style.SUCCESS(f'{hotel.name}: added {added} bookings, skipped {skipped}.'))
