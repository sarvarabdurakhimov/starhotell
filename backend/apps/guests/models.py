"""Guest profile — privacy-conscious, hotel-scoped."""
from django.db import models
from apps.common.models import TimestampedModel


class Guest(TimestampedModel):
    """
    Guest record scoped to a hotel.
    Collect only necessary personal information.
    Deletion of guests should be reviewed against data retention requirements.
    """
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='guests')
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    id_type = models.CharField(max_length=50, blank=True)  # e.g. passport, national ID
    id_number = models.CharField(max_length=100, blank=True)  # stored for regulatory compliance
    nationality = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)  # Internal notes — never exposed publicly
    is_vip = models.BooleanField(default=False)
    # Blacklisted guests cannot book through the Telegram bot; the panel shows a warning.
    is_blacklisted = models.BooleanField(default=False, db_index=True)
    blacklist_reason = models.TextField(blank=True)
    blacklisted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['hotel', 'email'], name='guest_hotel_email_idx'),
            models.Index(fields=['hotel', 'last_name'], name='guest_hotel_name_idx'),
        ]

    def __str__(self) -> str:
        return f'{self.first_name} {self.last_name}'

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()
