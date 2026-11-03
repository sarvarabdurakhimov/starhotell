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
