from rest_framework import serializers
from .models import Booking, BookingAuditLog


class BookingCreateSerializer(serializers.Serializer):
    room_id = serializers.IntegerField()
    guest_id = serializers.IntegerField()
    check_in = serializers.DateField()
    check_out = serializers.DateField()
    num_adults = serializers.IntegerField(min_value=1, default=1)
    num_children = serializers.IntegerField(min_value=0, default=0)
    special_requests = serializers.CharField(allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['check_in'] >= attrs['check_out']:
            raise serializers.ValidationError({'check_out': 'Check-out must be after check-in.'})
        return attrs


class BookingSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    guest_name = serializers.CharField(source='guest.full_name', read_only=True)
    room_number = serializers.CharField(source='room.room_number', read_only=True)
    guest_phone = serializers.CharField(source='guest.phone', read_only=True)
    guest_blacklisted = serializers.BooleanField(source='guest.is_blacklisted', read_only=True)
    paid_amount = serializers.SerializerMethodField()
    refunded_amount = serializers.SerializerMethodField()
    review_rating = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            'id', 'reference', 'status', 'status_display',
            'room', 'room_number', 'guest', 'guest_name',
            'check_in', 'check_out', 'num_adults', 'num_children',
            'rate_per_night', 'total_amount', 'discount_amount', 'currency',
            'special_requests', 'cancellation_reason',
            'actual_check_in', 'actual_check_out',
            'source', 'approved_at', 'payment_due_at', 'cancel_requested_at', 'guest_phone', 'guest_blacklisted',
            'paid_amount', 'refunded_amount', 'review_rating',
            'created_at', 'updated_at',
        )
        read_only_fields = fields

    def get_paid_amount(self, obj):
        from apps.payments.refunds import paid_and_refunded
        return str(paid_and_refunded(obj)[0])

    def get_refunded_amount(self, obj):
        from apps.payments.refunds import paid_and_refunded
        return str(paid_and_refunded(obj)[1])

    def get_review_rating(self, obj):
        from .models import BookingReview
        try:
            return obj.review.rating
        except BookingReview.DoesNotExist:
            return None


class BookingAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingAuditLog
        fields = ('id', 'old_status', 'new_status', 'notes', 'created_at')
