from rest_framework import generics
from apps.common.permissions import IsHotelMember, IsHotelManager
from .models import Room, RoomType
from .serializers import RoomSerializer, RoomTypeSerializer


class RoomTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomTypeSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        return RoomType.objects.filter(hotel_id=self.kwargs['hotel_id'])

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class RoomListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        qs = Room.objects.filter(hotel_id=self.kwargs['hotel_id']).select_related('room_type')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class RoomDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        return Room.objects.filter(hotel_id=self.kwargs['hotel_id'])
