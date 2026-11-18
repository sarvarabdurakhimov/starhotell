from rest_framework import serializers
from .models import Guest


class GuestSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    # Visit history, filled in by the list/detail querysets (annotations); absent on create
    stays = serializers.IntegerField(read_only=True, default=0)
    bookings_count = serializers.IntegerField(read_only=True, default=0)
    cancellations = serializers.IntegerField(read_only=True, default=0)
    total_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0)
    last_visit = serializers.DateField(read_only=True, default=None)
    avg_rating = serializers.FloatField(read_only=True, default=None)
    # The passport / ID number is accepted but never sent back: staff see only its last 4 characters
    id_number = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=100)
    id_number_hint = serializers.SerializerMethodField()

    def get_id_number_hint(self, obj) -> str:
        n = (obj.id_number or '').strip()
        return f'••••{n[-4:]}' if n else ''

    class Meta:
        model = Guest
        fields = (
            'id', 'first_name', 'last_name', 'full_name', 'email', 'phone',
            'id_type', 'id_number', 'id_number_hint', 'nationality', 'date_of_birth',
            'is_vip', 'is_blacklisted', 'blacklist_reason', 'blacklisted_at', 'created_at',
            'stays', 'bookings_count', 'cancellations', 'total_paid', 'last_visit', 'avg_rating',
        )
        read_only_fields = ('id', 'full_name', 'created_at', 'is_blacklisted', 'blacklist_reason', 'blacklisted_at')
        # notes field is intentionally excluded from API response for privacy
