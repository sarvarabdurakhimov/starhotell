"""Room types and individual rooms with operational status."""
from django.db import models
from apps.common.models import TimestampedModel


class RoomStatus(models.TextChoices):
    AVAILABLE = 'available', 'Available'
    OCCUPIED = 'occupied', 'Occupied'
    MAINTENANCE = 'maintenance', 'Under Maintenance'
    CLEANING = 'cleaning', 'Being Cleaned'
    OUT_OF_ORDER = 'out_of_order', 'Out of Order'


class RoomType(TimestampedModel):
    """Defines a category of rooms (e.g. Standard, Deluxe, Suite)."""
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='room_types')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    max_occupancy = models.PositiveSmallIntegerField(default=2)
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    amenities = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = [('hotel', 'name')]
        ordering = ['name']

    def __str__(self) -> str:
        return f'{self.hotel.name} — {self.name}'


class Room(TimestampedModel):
    """Individual room in a hotel. Status is operational (not availability-derived)."""
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='rooms')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='rooms')
    room_number = models.CharField(max_length=20)
    floor = models.SmallIntegerField(default=1)
    status = models.CharField(max_length=20, choices=RoomStatus.choices, default=RoomStatus.AVAILABLE, db_index=True)
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)  # Internal staff notes

    class Meta:
        unique_together = [('hotel', 'room_number')]
        ordering = ['room_number']
        indexes = [
            models.Index(fields=['hotel', 'status'], name='room_hotel_status_idx'),
        ]

    def __str__(self) -> str:
        return f'Room {self.room_number} ({self.hotel.name})'
