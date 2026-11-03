"""Django management command to populate initial demo data for testing."""
from datetime import date, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.users.models import User
from apps.hotels.models import Hotel, HotelSettings
from apps.memberships.models import HotelMembership, HotelRole
from apps.rooms.models import Room, RoomType, RoomStatus
from apps.guests.models import Guest
from apps.bookings.models import Booking, BookingStatus
from apps.housekeeping.models import HousekeepingTask, HousekeepingStatus
from apps.payments.models import Payment, PaymentStatus


class Command(BaseCommand):
    help = 'Seeds database with realistic multi-tenant hotel management demo data.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting HMS demo data seeding...'))

        # 1. Superuser
        admin, _ = User.objects.get_or_create(
            email='admin@hms.com',
            defaults={
                'first_name': 'System',
                'last_name': 'Admin',
                'is_staff': True,
                'is_superuser': True,
                'is_email_verified': True,
            }
        )
        admin.set_password('AdminPassword123!')
        admin.save()

        # 2. Hotel Owner & Staff
        owner, _ = User.objects.get_or_create(
            email='owner@silkroad.com',
            defaults={
                'first_name': 'Akmal',
                'last_name': 'Karimov',
                'is_email_verified': True,
            }
        )
        owner.set_password('OwnerPassword123!')
        owner.save()

        manager, _ = User.objects.get_or_create(
            email='manager@silkroad.com',
            defaults={
                'first_name': 'Malika',
                'last_name': 'Yusupova',
                'is_email_verified': True,
            }
        )
        manager.set_password('ManagerPassword123!')
        manager.save()

        # 3. Demo Hotel
        hotel, created = Hotel.objects.get_or_create(
            slug='silk-road-palace',
            defaults={
                'name': 'Silk Road Palace Samarkand',
                'phone': '+998661234567',
                'email': 'info@silkroadpalace.uz',
                'city': 'Samarkand',
                'country': 'Uzbekistan',
                'currency': 'USD',
                'timezone': 'Asia/Tashkent',
                'star_rating': 5,
                'address_line1': 'Registan Avenue 12',
                'is_active': True,
            }
        )
        HotelSettings.objects.get_or_create(hotel=hotel)

        # 4. Memberships
        HotelMembership.objects.get_or_create(
            hotel=hotel, user=owner, defaults={'role': HotelRole.OWNER, 'is_active': True}
        )
        HotelMembership.objects.get_or_create(
            hotel=hotel, user=manager, defaults={'role': HotelRole.MANAGER, 'is_active': True}
        )

        # 5. Room Types
        deluxe, _ = RoomType.objects.get_or_create(
            hotel=hotel,
            name='Deluxe King Suite',
            defaults={
                'base_price': Decimal('180.00'),
                'max_occupancy': 2,
                'description': 'Spacious king suite with panoramic views of ancient minarets.',
                'amenities': ['King Bed', 'Balcony', 'Minibar', 'High-speed WiFi', 'Espresso Machine'],
            }
        )

        standard, _ = RoomType.objects.get_or_create(
            hotel=hotel,
            name='Standard Twin Room',
            defaults={
                'base_price': Decimal('95.00'),
                'max_occupancy': 2,
                'description': 'Comfortable twin room suitable for business travelers.',
                'amenities': ['Twin Beds', 'Work Desk', 'Ensuite Bathroom', 'High-speed WiFi'],
            }
        )

        # 6. Physical Rooms
        room101, _ = Room.objects.get_or_create(
            hotel=hotel, room_number='101',
            defaults={'floor': 1, 'room_type': standard, 'status': RoomStatus.AVAILABLE}
        )
        room102, _ = Room.objects.get_or_create(
            hotel=hotel, room_number='102',
            defaults={'floor': 1, 'room_type': standard, 'status': RoomStatus.AVAILABLE}
        )
        room201, _ = Room.objects.get_or_create(
            hotel=hotel, room_number='201',
            defaults={'floor': 2, 'room_type': deluxe, 'status': RoomStatus.OCCUPIED}
        )
        room202, _ = Room.objects.get_or_create(
            hotel=hotel, room_number='202',
            defaults={'floor': 2, 'room_type': deluxe, 'status': RoomStatus.AVAILABLE}
        )

        # 7. Guests
        guest1, _ = Guest.objects.get_or_create(
            hotel=hotel,
            email='guest.john@example.com',
            defaults={
                'first_name': 'John',
                'last_name': 'Doe',
                'phone': '+12025550199',
                'nationality': 'USA',
                'id_type': 'passport',
                'id_number': 'US987654321',
                'is_vip': True,
            }
        )

        guest2, _ = Guest.objects.get_or_create(
            hotel=hotel,
            email='sarah.connor@example.com',
            defaults={
                'first_name': 'Sarah',
                'last_name': 'Connor',
                'phone': '+447911123456',
                'nationality': 'United Kingdom',
                'id_type': 'passport',
                'id_number': 'GB554433221',
            }
        )

        # 8. Bookings
        today = date.today()
        b1, _ = Booking.objects.get_or_create(
            hotel=hotel,
            room=room201,
            guest=guest1,
            defaults={
                'check_in': today - timedelta(days=1),
                'check_out': today + timedelta(days=3),
                'status': BookingStatus.CHECKED_IN,
                'num_adults': 2,
                'rate_per_night': deluxe.base_price,
                'total_amount': deluxe.base_price * 4,
                'currency': 'USD',
                'created_by': manager,
            }
        )

        # 9. Payment
        Payment.objects.get_or_create(
            booking=b1,
            hotel=hotel,
            defaults={
                'amount': b1.total_amount,
                'currency': 'USD',
                'status': PaymentStatus.SUCCEEDED,
                'provider': 'stripe',
                'provider_transaction_id': 'ch_demo_123456789',
            }
        )

        # 10. Housekeeping Task
        HousekeepingTask.objects.get_or_create(
            hotel=hotel,
            room=room102,
            defaults={
                'status': HousekeepingStatus.DIRTY,
                'notes': 'Checkout completed this morning. Deep clean requested.',
            }
        )

        self.stdout.write(self.style.SUCCESS(
            'Demo data seeded successfully!\n'
            'Admin: admin@hms.com / AdminPassword123!\n'
            'Owner: owner@silkroad.com / OwnerPassword123!\n'
            'Manager: manager@silkroad.com / ManagerPassword123!\n'
            'Hotel: Silk Road Palace Samarkand (/hotels/1)'
        ))
