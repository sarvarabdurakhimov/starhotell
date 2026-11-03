from rest_framework import serializers
from .models import HousekeepingTask


class HousekeepingTaskSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.room_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = HousekeepingTask
        fields = (
            'id', 'room', 'room_number', 'assigned_to', 'status',
            'status_display', 'notes', 'completed_at', 'created_at',
        )
        read_only_fields = ('id', 'created_at')
