"""Hotel model — the core tenant unit of the HMS SaaS platform."""
import zoneinfo
from django.db import models

from apps.common.money import CURRENCY, CURRENCY_CHOICES
from django.conf import settings
from apps.common.models import TimestampedModel
from apps.organizations.models import Organization

TIMEZONE_CHOICES = [(tz, tz) for tz in sorted(zoneinfo.available_timezones())]


class Hotel(TimestampedModel):
    """Represents one hotel (the primary tenant unit)."""
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name='hotels',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state_province = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, default='Uzbekistan')
    timezone = models.CharField(max_length=64, default='Asia/Tashkent', choices=TIMEZONE_CHOICES)
    currency = models.CharField(max_length=3, default=CURRENCY, choices=CURRENCY_CHOICES, editable=False)  # always so'm
    locale = models.CharField(max_length=10, default='en-US')
    is_active = models.BooleanField(default=True, db_index=True)
    logo = models.ImageField(upload_to='hotels/logos/', blank=True, null=True)
    star_rating = models.PositiveSmallIntegerField(default=0)  # 0-5
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = 'hotel'
        verbose_name_plural = 'hotels'
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'slug'], name='hotel_active_slug_idx'),
        ]

    def __str__(self) -> str:
        return self.name


class HotelSettings(TimestampedModel):
    """Hotel-specific configuration settings."""
    hotel = models.OneToOneField(Hotel, on_delete=models.CASCADE, related_name='settings')
    check_in_time = models.TimeField(default='14:00')
    check_out_time = models.TimeField(default='11:00')
    max_advance_booking_days = models.PositiveIntegerField(default=365)
    cancellation_hours = models.PositiveIntegerField(default=24)
    allow_same_day_booking = models.BooleanField(default=True)
    tax_rate_percent = models.DecimalField(max_digits=5, decimal_places=2, default='0.00')
    breakfast_included_default = models.BooleanField(default=False)
    terms_and_conditions = models.TextField(blank=True)

    class Meta:
        verbose_name = 'hotel settings'

    def __str__(self) -> str:
        return f'Settings for {self.hotel.name}'
