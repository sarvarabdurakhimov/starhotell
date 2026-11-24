"""HotelMembership — links users to hotels with role-based access control."""
from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel


class HotelRole(models.TextChoices):
    OWNER = 'owner', 'Owner'
    MANAGER = 'manager', 'Manager'
    RECEPTIONIST = 'receptionist', 'Receptionist'
    HOUSEKEEPING = 'housekeeping', 'Housekeeping Staff'
    FINANCE = 'finance', 'Finance Staff'
    AUDITOR = 'auditor', 'Read-only Auditor'


class HotelMembership(TimestampedModel):
    """
    Relates a User to a Hotel with a specific role.
    A user may have at most one active membership per hotel.
    Role determines what actions the user can perform within that hotel.
    """
    hotel = models.ForeignKey(
        'hotels.Hotel',
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hotel_memberships',
    )
    role = models.CharField(max_length=20, choices=HotelRole.choices, default=HotelRole.RECEPTIONIST)
    is_active = models.BooleanField(default=True, db_index=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_invitations',
    )
    notes = models.TextField(blank=True)
    # True when this hotel created the login itself (invite with a new email). Only such accounts
    # may get a new password from the hotel's owner/manager; anyone else's account is not theirs.
    account_created = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'hotel membership'
        verbose_name_plural = 'hotel memberships'
        constraints = [
            models.UniqueConstraint(
                fields=['hotel', 'user'],
                condition=models.Q(is_active=True),
                name='unique_active_membership',
            )
        ]
        indexes = [
            models.Index(fields=['hotel', 'user', 'is_active'], name='membership_lookup_idx'),
            models.Index(fields=['hotel', 'role', 'is_active'], name='membership_role_idx'),
        ]

    def __str__(self) -> str:
        return f'{self.user.email} @ {self.hotel.name} ({self.role})'
