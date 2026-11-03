from rest_framework import generics
from rest_framework.exceptions import ValidationError
from apps.common.permissions import IsHotelMember
from .models import HousekeepingTask, HousekeepingStatus
from .serializers import HousekeepingTaskSerializer


def _check_room_in_hotel(serializer, hotel_id):
    room = serializer.validated_data.get('room')
    if room and str(room.hotel_id) != str(hotel_id):
        raise ValidationError({'room': 'Room does not belong to this hotel.'})


class HousekeepingTaskListCreateView(generics.ListCreateAPIView):
    serializer_class = HousekeepingTaskSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return HousekeepingTask.objects.filter(
            hotel_id=self.kwargs['hotel_id']
        ).select_related('room', 'assigned_to')

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        _check_room_in_hotel(serializer, self.kwargs['hotel_id'])
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class HousekeepingTaskDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = HousekeepingTaskSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return HousekeepingTask.objects.filter(hotel_id=self.kwargs['hotel_id'])

    def perform_update(self, serializer):
        _check_room_in_hotel(serializer, self.kwargs['hotel_id'])
        task = serializer.save()
        # An inspected room is ready for the next guest, unless someone is staying in it.
        if task.status == HousekeepingStatus.INSPECTED:
            from apps.rooms.models import RoomStatus
            from apps.bookings.models import Booking, BookingStatus
            room = task.room
            occupied = Booking.objects.filter(room=room, status=BookingStatus.CHECKED_IN).exists()
            if not occupied and room.status == RoomStatus.CLEANING:
                room.status = RoomStatus.AVAILABLE
                room.save(update_fields=['status'])
