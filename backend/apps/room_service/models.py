"""Room service: the hotel's menu of things a staying guest can order, and the orders."""
from django.conf import settings
from django.db import models

from apps.common.models import TimestampedModel


class ItemCategory(models.TextChoices):
    FOOD = 'food', 'Ovqat'
    DRINK = 'drink', 'Ichimlik'
    FRUIT = 'fruit', 'Meva'
    LINEN = 'linen', "Ko'rpa-to'shak"
    HYGIENE = 'hygiene', 'Gigiyena'
    OTHER = 'other', 'Boshqa'


class ServiceItem(TimestampedModel):
    """One thing on the hotel's menu. Price 0 means free (towels, pillows, ...)."""
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='service_items')
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=ItemCategory.choices, default=ItemCategory.OTHER)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # so'm
    is_active = models.BooleanField(default=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['category', 'position', 'name']
        unique_together = [('hotel', 'name')]

    def __str__(self) -> str:
        return self.name


class OrderStatus(models.TextChoices):
    NEW = 'new', 'Yangi'
    ACCEPTED = 'accepted', 'Qabul qilindi'
    DELIVERED = 'delivered', 'Yetkazildi'
    CANCELLED = 'cancelled', 'Bekor qilindi'


class ServiceOrder(TimestampedModel):
    """A guest's order for their room during a stay. Paid at the front desk (is_paid)."""
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.CASCADE, related_name='service_orders')
    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, related_name='service_orders')
    room = models.ForeignKey('rooms.Room', on_delete=models.PROTECT, related_name='service_orders')
    telegram_chat = models.ForeignKey('telegram_bot.TelegramChat', on_delete=models.SET_NULL, null=True,
                                      blank=True, related_name='service_orders')
    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.NEW, db_index=True)
    note = models.CharField(max_length=500, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='+')
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'#{self.pk} ({self.room})'


class ServiceOrderLine(models.Model):
    """Name and price are copied, so later menu edits do not change past orders."""
    order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(ServiceItem, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveSmallIntegerField(default=1)

    @property
    def amount(self):
        return self.price * self.quantity
