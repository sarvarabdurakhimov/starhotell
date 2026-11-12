"""Reservation model with explicit status transitions and audit history."""
import uuid
from django.db import models
from django.core.exceptions import ValidationError
from apps.common.models import TimestampedModel


class BookingStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    CONFIRMED = 'confirmed', 'Confirmed'
    CHECKED_IN = 'checked_in', 'Checked In'
    CHECKED_OUT = 'checked_out', 'Checked Out'
    CANCELLED = 'cancelled', 'Cancelled'
    NO_SHOW = 'no_show', 'No Show'


# Valid status transitions state machine
STATUS_TRANSITIONS = {
    BookingStatus.PENDING: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    BookingStatus.CONFIRMED: [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
    BookingStatus.CHECKED_IN: [BookingStatus.CHECKED_OUT],
    BookingStatus.CHECKED_OUT: [],
    BookingStatus.CANCELLED: [],
    BookingStatus.NO_SHOW: [],
}


class BookingSource(models.TextChoices):
    PANEL = 'panel', 'Panel'
    TELEGRAM = 'telegram', 'Telegram bot'


class Booking(TimestampedModel):
    """
    Hotel reservation.
    Stay interval is [check_in, check_out) — departure date is NOT an occupied night.
    """
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.PROTECT, related_name='bookings')
    room = models.ForeignKey('rooms.Room', on_delete=models.PROTECT, related_name='bookings')
    guest = models.ForeignKey('guests.Guest', on_delete=models.PROTECT, related_name='bookings')
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, related_name='created_bookings'
    )

    reference = models.CharField(max_length=20, unique=True, editable=False)
    status = models.CharField(
        max_length=20, choices=BookingStatus.choices,
        default=BookingStatus.PENDING, db_index=True
    )

    check_in = models.DateField(db_index=True)
    check_out = models.DateField(db_index=True)
    num_adults = models.PositiveSmallIntegerField(default=1)
    num_children = models.PositiveSmallIntegerField(default=0)

    # Price snapshot at time of booking — never recalculated retroactively
    rate_per_night = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')

    special_requests = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)

    # Where the booking came from. Telegram requests wait in PENDING until a manager
    # approves them; the guest then has until payment_due_at to pay, or the request lapses.
    source = models.CharField(max_length=20, choices=BookingSource.choices, default=BookingSource.PANEL, db_index=True)
    telegram_chat = models.ForeignKey(
        'telegram_bot.TelegramChat', on_delete=models.SET_NULL, null=True, blank=True, related_name='bookings'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    payment_due_at = models.DateTimeField(null=True, blank=True)
    # The guest asked (in Telegram) to cancel; a manager decides. Cleared when decided.
    cancel_requested_at = models.DateTimeField(null=True, blank=True)

    actual_check_in = models.DateTimeField(null=True, blank=True)
    actual_check_out = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['hotel', 'status'], name='booking_hotel_status_idx'),
            models.Index(fields=['hotel', 'check_in', 'check_out'], name='booking_dates_idx'),
            models.Index(fields=['room', 'check_in', 'check_out'], name='booking_room_dates_idx'),
            models.Index(fields=['guest'], name='booking_guest_idx'),
        ]

    def __str__(self) -> str:
        return f'Booking {self.reference} ({self.status})'

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = self._generate_reference()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_reference() -> str:
        return f'HMS-{uuid.uuid4().hex[:8].upper()}'

    def clean(self):
        if self.check_in and self.check_out and self.check_in >= self.check_out:
            raise ValidationError('Check-out date must be after check-in date.')
        if self.room_id and self.hotel_id and self.room.hotel_id != self.hotel_id:
            raise ValidationError('Room does not belong to this hotel.')
        if self.guest_id and self.hotel_id and self.guest.hotel_id != self.hotel_id:
            raise ValidationError('Guest does not belong to this hotel.')

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in STATUS_TRANSITIONS.get(self.status, [])


class BookingAuditLog(TimestampedModel):
    """Immutable audit record for booking status changes."""
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='audit_logs')
    changed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True)
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']


class BookingReview(TimestampedModel):
    """The guest's 1-5 rating (and optional comment) after the stay, collected by the Telegram bot."""
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='review')
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='reviews')
    guest = models.ForeignKey('guests.Guest', on_delete=models.CASCADE, related_name='reviews')
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['hotel', 'created_at'], name='review_hotel_created_idx')]

    def __str__(self) -> str:
        return f'{self.booking_id}: {self.rating}'
