"""Reusable DRF permission classes for hotel-scoped access control."""
from rest_framework.permissions import BasePermission


class IsHotelMember(BasePermission):
    """Allow access only to authenticated users who are members of the hotel."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        hotel_id = view.kwargs.get('hotel_id')
        if not hotel_id:
            return False
        from apps.memberships.models import HotelMembership
        return HotelMembership.objects.filter(
            user=request.user,
            hotel_id=hotel_id,
            is_active=True,
        ).exists()


class IsHotelManager(BasePermission):
    """Allow access only to hotel members with Manager or Owner role."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        hotel_id = view.kwargs.get('hotel_id')
        if not hotel_id:
            return False
        from apps.memberships.models import HotelMembership, HotelRole
        allowed_roles = [HotelRole.OWNER, HotelRole.MANAGER]
        return HotelMembership.objects.filter(
            user=request.user,
            hotel_id=hotel_id,
            role__in=allowed_roles,
            is_active=True,
        ).exists()


class IsHotelOwner(BasePermission):
    """Allow access only to hotel owners."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        hotel_id = view.kwargs.get('hotel_id')
        if not hotel_id:
            return False
        from apps.memberships.models import HotelMembership, HotelRole
        return HotelMembership.objects.filter(
            user=request.user,
            hotel_id=hotel_id,
            role=HotelRole.OWNER,
            is_active=True,
        ).exists()


# Staff role groups (owner and manager are always allowed on top of these).
# Kept in line with STAFF_PAGES in frontend/src/lib/session.ts.
FRONT_DESK = ('receptionist',)                        # bookings, check-in/out, guest records
ROOM_STAFF = ('receptionist', 'housekeeping')         # housekeeping tasks
FINANCE_VIEW = ('finance', 'auditor')                 # payments (read-only)
ALL_STAFF = ('receptionist', 'housekeeping', 'finance', 'auditor')


class HotelRoleAccess(BasePermission):
    """
    Role check per request kind, enforced on the server (not only by hiding pages).
    The view sets `read_roles` (GET/HEAD/OPTIONS) and `write_roles` (everything else);
    owner and manager always pass. A view without `write_roles` is read-only for staff.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        hotel_id = view.kwargs.get('hotel_id')
        if not hotel_id:
            return False
        from apps.memberships.models import HotelMembership, HotelRole
        safe = request.method in ('GET', 'HEAD', 'OPTIONS')
        roles = getattr(view, 'read_roles' if safe else 'write_roles', ())
        return HotelMembership.objects.filter(
            user=request.user,
            hotel_id=hotel_id,
            role__in=[HotelRole.OWNER, HotelRole.MANAGER, *roles],
            is_active=True,
        ).exists()


class IsPlatformAdmin(BasePermission):
    """Allow access only to superusers (platform-level admin)."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
