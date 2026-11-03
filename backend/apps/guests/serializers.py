from rest_framework import serializers
from .models import Guest


class GuestSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Guest
        fields = (
            'id', 'first_name', 'last_name', 'full_name', 'email', 'phone',
            'id_type', 'id_number', 'nationality', 'date_of_birth',
            'is_vip', 'created_at',
        )
        read_only_fields = ('id', 'full_name', 'created_at')
        # notes field is intentionally excluded from API response for privacy
