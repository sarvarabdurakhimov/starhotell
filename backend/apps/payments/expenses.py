"""Financial and operating expense tracking with traceable reversals and approvals."""
from decimal import Decimal
from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel


class ExpenseCategory(models.TextChoices):
    SALARIES = 'salaries', 'Staff Salaries & Wages'
    UTILITIES = 'utilities', 'Utilities (Electricity, Water, Gas)'
    MAINTENANCE = 'maintenance', 'Repairs & Maintenance'
    SUPPLIES = 'supplies', 'Hotel & Guest Supplies'
    MARKETING = 'marketing', 'Marketing & Advertising'
    FOOD_BEVERAGE = 'food_beverage', 'Food & Beverage Procurement'
    TAXES_LICENSES = 'taxes_licenses', 'Taxes, Permits & Licenses'
    SOFTWARE = 'software', 'Software & Technology Services'
    OTHER = 'other', 'Other Operating Expenses'


class ExpenseStatus(models.TextChoices):
    PENDING_APPROVAL = 'pending_approval', 'Pending Approval'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'
    REVERSED = 'reversed', 'Reversed (Audited Reversal)'


class Expense(TimestampedModel):
    """
    Operating expense record scoped strictly to a hotel.
    Expenses cannot be permanently deleted; reversals require an auditable trail.
    """
    hotel = models.ForeignKey(
        'hotels.Hotel',
        on_delete=models.PROTECT,
        related_name='expenses'
    )
    category = models.CharField(
        max_length=50,
        choices=ExpenseCategory.choices,
        default=ExpenseCategory.SUPPLIES,
        db_index=True
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    expense_date = models.DateField(db_index=True)

    status = models.CharField(
        max_length=30,
        choices=ExpenseStatus.choices,
        default=ExpenseStatus.APPROVED,
        db_index=True
    )

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='recorded_expenses'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_expenses'
    )
    reversal_reason = models.TextField(blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reversed_expenses'
    )

    class Meta:
        ordering = ['-expense_date', '-created_at']
        indexes = [
            models.Index(fields=['hotel', 'status', 'expense_date'], name='expense_hotel_date_idx'),
            models.Index(fields=['hotel', 'category'], name='expense_hotel_cat_idx'),
        ]

    def __str__(self) -> str:
        return f"{self.title}: {self.amount} {self.currency} ({self.get_status_display()})"
