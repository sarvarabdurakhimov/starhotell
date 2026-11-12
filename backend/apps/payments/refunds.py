"""Recording money given back to a guest (the transfer itself is done by hand in Click/Payme or in cash)."""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Payment, PaymentStatus

# Payments where money was received (fully or partly given back later)
PAID_STATUSES = [PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED]


def paid_and_refunded(booking) -> tuple[Decimal, Decimal]:
    paid = refunded = Decimal('0')
    for p in booking.payments.all():
        if p.status in PAID_STATUSES:
            paid += p.amount
            refunded += p.refunded_amount
    return paid, refunded


@transaction.atomic
def record_refund(booking, amount, note: str, user) -> Decimal:
    """Spread the refund over the booking's payments (newest first). Returns the amount recorded."""
    try:
        amount = Decimal(str(amount)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        raise ValidationError({'amount': "Summa noto'g'ri."})
    payments = list(
        Payment.objects.select_for_update().filter(booking=booking, status__in=PAID_STATUSES).order_by('-created_at')
    )
    left = sum((p.amount - p.refunded_amount for p in payments), Decimal('0'))
    if amount <= 0:
        raise ValidationError({'amount': "Summa 0 dan katta bo'lishi kerak."})
    if amount > left:
        raise ValidationError({'amount': f"Qaytarish mumkin bo'lgan eng ko'p summa: {left}."})

    remaining = amount
    now = timezone.now()
    for p in payments:
        if remaining <= 0:
            break
        part = min(remaining, p.amount - p.refunded_amount)
        if part <= 0:
            continue
        p.refunded_amount += part
        p.status = PaymentStatus.REFUNDED if p.refunded_amount >= p.amount else PaymentStatus.PARTIALLY_REFUNDED
        p.provider_metadata = {
            **(p.provider_metadata or {}),
            'refunds': [*(p.provider_metadata or {}).get('refunds', []), {
                'amount': str(part), 'at': now.isoformat(), 'by': getattr(user, 'email', ''), 'note': note,
            }],
        }
        p.save(update_fields=['refunded_amount', 'status', 'provider_metadata', 'updated_at'])
        remaining -= part
    return amount
