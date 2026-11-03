from rest_framework import serializers
from .models import Room, RoomType, RoomStatus


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = ('id', 'name', 'description', 'max_occupancy', 'base_price', 'amenities', 'created_at')
        read_only_fields = ('id', 'created_at')


class RoomSerializer(serializers.ModelSerializer):
    room_type_detail = RoomTypeSerializer(source='room_type', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Room
        fields = (
            'id', 'room_number', 'floor', 'status', 'status_display',
            'room_type', 'room_type_detail', 'description', 'notes', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

    def validate(self, attrs):
        hotel_id = self.context['view'].kwargs.get('hotel_id')
        room_type = attrs.get('room_type')
        if room_type and str(room_type.hotel_id) != str(hotel_id):
            raise serializers.ValidationError({'room_type': 'Room type does not belong to this hotel.'})

        new_status = attrs.get('status')
        if new_status == RoomStatus.AVAILABLE and self.instance:
            from apps.bookings.models import Booking, BookingStatus
            has_active_booking = Booking.objects.filter(
                room=self.instance,
                status=BookingStatus.CHECKED_IN,
            ).exists()
            if has_active_booking:
                raise serializers.ValidationError({
                    'status': 'Xonada ayni vaqtda yashayotgan mehmon mavjud. Mehmon checkout qilmasdan xonani mavjud (available) deb belgilab bo‘lmaydi.'
                })
        return attrs
