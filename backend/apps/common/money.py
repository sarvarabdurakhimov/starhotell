"""The system works in one currency only: Uzbek so'm."""
from decimal import ROUND_HALF_UP, Decimal

CURRENCY = 'UZS'
CURRENCY_CHOICES = [(CURRENCY, "O'zbek so'mi")]


def som(amount) -> str:
    """1250000 -> "1 250 000 so'm" (whole so'm, space-grouped)."""
    n = Decimal(amount or 0).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return f"{n:,.0f} so'm".replace(',', ' ')
