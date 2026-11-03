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


class IsPlatformAdmin(BasePermission):
    """Allow access only to superusers (platform-level admin)."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
