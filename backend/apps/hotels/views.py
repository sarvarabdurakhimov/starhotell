"""Hotel API views — tenant-scoped."""
from django.utils.text import slugify
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.memberships.models import HotelMembership, HotelRole
from apps.common.permissions import IsHotelManager, IsPlatformAdmin

from .models import Hotel, HotelSettings
from .serializers import HotelSerializer, HotelCreateSerializer


class HotelListView(generics.ListAPIView):
    """
    GET /api/v1/hotels/
    Returns hotels the authenticated user is an active member of.
    Never exposes hotels the user is not authorized to access.
    """
    serializer_class = HotelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Hotel.objects.filter(
            memberships__user=self.request.user,
            memberships__is_active=True,
            is_active=True,
        ).select_related('settings').distinct()


class HotelCreateView(generics.CreateAPIView):
    """POST /api/v1/hotels/ — Creates a hotel and makes the requester an Owner."""
    serializer_class = HotelCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        name = serializer.validated_data.get('name', '')
        base_slug = slugify(name)
        slug = base_slug
        count = 1
        while Hotel.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{count}"
            count += 1
        hotel = serializer.save(slug=slug)
        # Create default settings
        HotelSettings.objects.create(hotel=hotel)
        # Make the creator the owner
        HotelMembership.objects.create(
            hotel=hotel,
            user=self.request.user,
            role=HotelRole.OWNER,
            is_active=True,
        )


class HotelDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/v1/hotels/{hotel_id}/
    User must be an active member. Update requires Manager or Owner role.
    """
    serializer_class = HotelSerializer
    # Named hotel_id so IsHotelManager can read it (it looks up view.kwargs['hotel_id'])
    lookup_url_kwarg = 'hotel_id'

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsHotelManager()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Only return hotels the user is authorized to view."""
        return Hotel.objects.filter(
            memberships__user=self.request.user,
            memberships__is_active=True,
        ).select_related('settings').distinct()
