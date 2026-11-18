"""Move all money to Uzbek so'm: the system no longer has other currencies.

Dollar amounts are converted at 1 USD = 12 500 so'm (room prices, bookings,
payments, expenses), then every currency label becomes UZS.
"""
from decimal import Decimal

from django.db import migrations
from django.db.models import F

RATES = {'USD': Decimal('12500')}


def convert(apps, schema_editor):
    Hotel = apps.get_model('hotels', 'Hotel')
    RoomType = apps.get_model('rooms', 'RoomType')
    Booking = apps.get_model('bookings', 'Booking')
    Payment = apps.get_model('payments', 'Payment')
    Expense = apps.get_model('payments', 'Expense')

    for code, rate in RATES.items():
        # Room prices carry no currency of their own: they are in their hotel's currency
        hotel_ids = list(Hotel.objects.filter(currency__iexact=code).values_list('id', flat=True))
        RoomType.objects.filter(hotel_id__in=hotel_ids).update(base_price=F('base_price') * rate)
        Booking.objects.filter(currency__iexact=code).update(
            rate_per_night=F('rate_per_night') * rate, total_amount=F('total_amount') * rate,
        )
        Payment.objects.filter(currency__iexact=code).update(
            amount=F('amount') * rate, refunded_amount=F('refunded_amount') * rate,
        )
        Expense.objects.filter(currency__iexact=code).update(amount=F('amount') * rate)

    for model in (Hotel, Booking, Payment, Expense):
        leftover = model.objects.exclude(currency__in=['UZS', *RATES]).values_list('currency', flat=True).distinct()
        if leftover:
            # No rate known: the numbers stay as they are, only the label changes
            print(f'\n  ! {model.__name__}: {", ".join(leftover)} amounts relabelled as UZS without conversion')
        model.objects.exclude(currency='UZS').update(currency='UZS')


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0003_alter_hotel_currency'),
        ('rooms', '0002_roomtypephoto'),
        ('bookings', '0007_alter_booking_currency'),
        ('payments', '0003_alter_expense_currency_alter_payment_currency'),
    ]

    operations = [
        # Not reversible: after this, nothing records which amounts were dollars
        migrations.RunPython(convert, migrations.RunPython.noop),
    ]
