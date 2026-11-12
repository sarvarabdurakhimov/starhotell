"""Add a fuller set of demo rooms (4 floors, 5 room types) to a hotel.

Safe to run more than once: existing room types and rooms are left as they are.

    python manage.py add_demo_rooms              # first hotel
    python manage.py add_demo_rooms --hotel 3
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.hotels.models import Hotel
from apps.rooms.models import Room, RoomStatus, RoomType

ROOM_TYPES = {
    'economy': ('Economy Single', '60.00', 1, 'Compact single room for solo travelers.',
                ['Single Bed', 'High-speed WiFi', 'Shower']),
    'standard': ('Standard Twin Room', '95.00', 2, 'Comfortable twin room suitable for business travelers.',
                 ['Twin Beds', 'Work Desk', 'Ensuite Bathroom', 'High-speed WiFi']),
    'deluxe': ('Deluxe King Suite', '180.00', 2, 'Spacious king suite with panoramic views of ancient minarets.',
               ['King Bed', 'Balcony', 'Minibar', 'High-speed WiFi', 'Espresso Machine']),
    'family': ('Family Suite', '240.00', 4, 'Two-room suite with a king bed and two singles.',
               ['King Bed', 'Two Single Beds', 'Living Area', 'Minibar', 'High-speed WiFi']),
    'presidential': ('Presidential Suite', '450.00', 2, 'Top-floor suite with private terrace and lounge.',
                     ['King Bed', 'Private Terrace', 'Jacuzzi', 'Lounge', 'Butler Service']),
}

# floor -> list of (room number, type key)
LAYOUT = {
    1: [('101', 'standard'), ('102', 'standard'), ('103', 'economy'), ('104', 'economy'),
        ('105', 'economy'), ('106', 'standard')],
    2: [('201', 'deluxe'), ('202', 'deluxe'), ('203', 'standard'), ('204', 'standard'),
        ('205', 'standard'), ('206', 'deluxe')],
    3: [('301', 'deluxe'), ('302', 'deluxe'), ('303', 'family'), ('304', 'family'),
        ('305', 'deluxe'), ('306', 'family')],
    4: [('401', 'family'), ('402', 'family'), ('403', 'presidential'), ('404', 'presidential')],
}

# A few rooms start in other states so the dashboards show some variety
INITIAL_STATUS = {'105': RoomStatus.CLEANING, '204': RoomStatus.CLEANING, '305': RoomStatus.MAINTENANCE}


class Command(BaseCommand):
    help = 'Adds demo room types and rooms (4 floors, 22 rooms) to a hotel.'

    def add_arguments(self, parser):
        parser.add_argument('--hotel', type=int, help='Hotel id (default: first hotel)')

    @transaction.atomic
    def handle(self, *args, **options):
        hotel_id = options.get('hotel')
        hotel = Hotel.objects.filter(id=hotel_id).first() if hotel_id else Hotel.objects.order_by('id').first()
        if not hotel:
            raise CommandError('Hotel not found. Run seed_hms_data first or pass --hotel.')

        types = {}
        for key, (name, price, occupancy, description, amenities) in ROOM_TYPES.items():
            types[key], _ = RoomType.objects.get_or_create(
                hotel=hotel,
                name=name,
                defaults={
                    'base_price': Decimal(price),
                    'max_occupancy': occupancy,
                    'description': description,
                    'amenities': amenities,
                },
            )

        added = 0
        for floor, rooms in LAYOUT.items():
            for number, type_key in rooms:
                _, created = Room.objects.get_or_create(
                    hotel=hotel,
                    room_number=number,
                    defaults={
                        'floor': floor,
                        'room_type': types[type_key],
                        'status': INITIAL_STATUS.get(number, RoomStatus.AVAILABLE),
                    },
                )
                added += created

        self.stdout.write(self.style.SUCCESS(
            f'{hotel.name}: added {added} rooms, total {hotel.rooms.count()}.'
        ))
