from rest_framework import serializers
from apps.users.serializers import UserProfileSerializer
from .models import HotelMembership, HotelRole


class HotelMembershipSerializer(serializers.ModelSerializer):
    user = UserProfileSerializer(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = HotelMembership
        fields = ('id', 'user', 'role', 'role_display', 'is_active', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=HotelRole.choices)
    # Only used when no account exists for this email yet: the account is created on the spot
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)

    def validate_email(self, value):
        return value.strip().lower()
