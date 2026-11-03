"""Payment records with idempotency and audit trail. No raw card data stored."""
import uuid
from django.db import models
from apps.common.models import TimestampedModel


class PaymentStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    SUCCEEDED = 'succeeded', 'Succeeded'
    FAILED = 'failed', 'Failed'
    REFUNDED = 'refunded', 'Refunded'
    PARTIALLY_REFUNDED = 'partially_refunded', 'Partially Refunded'


class Payment(TimestampedModel):
    """
    Payment record linked to a booking.
    Never stores card numbers, CVVs, or other prohibited credentials.
    Provider transaction reference is stored for reconciliation.
    """
    booking = models.ForeignKey('bookings.Booking', on_delete=models.PROTECT, related_name='payments')
    hotel = models.ForeignKey('hotels.Hotel', on_delete=models.PROTECT, related_name='payments')

    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=30, choices=PaymentStatus.choices, default=PaymentStatus.PENDING, db_index=True)

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default='0.00')

    provider = models.CharField(max_length=50, default='stripe')
    provider_transaction_id = models.CharField(max_length=255, blank=True, db_index=True)
    provider_metadata = models.JSONField(default=dict, blank=True)

    failure_reason = models.TextField(blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['hotel', 'status', 'created_at'], name='payment_hotel_status_idx'),
        ]

    def __str__(self) -> str:
        return f'Payment {self.idempotency_key} ({self.status})'


from .expenses import Expense, ExpenseCategory, ExpenseStatus

