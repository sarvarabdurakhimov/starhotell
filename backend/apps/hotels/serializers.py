from rest_framework import serializers
from .models import Hotel, HotelSettings


class HotelSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = HotelSettings
        exclude = ('id', 'hotel', 'created_at', 'updated_at')


class HotelSerializer(serializers.ModelSerializer):
    settings = HotelSettingsSerializer(required=False)

    def update(self, instance, validated_data):
        settings_data = validated_data.pop('settings', None)
        instance = super().update(instance, validated_data)
        if settings_data:
            # Update the object already attached to the hotel, so the response shows new values
            try:
                hotel_settings = instance.settings
            except HotelSettings.DoesNotExist:
                hotel_settings = HotelSettings(hotel=instance)
            for field, value in settings_data.items():
                setattr(hotel_settings, field, value)
            hotel_settings.save()
        return instance

    class Meta:
        model = Hotel
        fields = (
            'id', 'name', 'slug', 'phone', 'email', 'website',
            'address_line1', 'address_line2', 'city', 'state_province',
            'postal_code', 'country', 'timezone', 'currency', 'locale',
            'is_active', 'star_rating', 'description', 'settings', 'created_at',
        )
        read_only_fields = ('id', 'slug', 'currency', 'created_at')


class HotelCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = (
            'name', 'phone', 'email', 'website', 'address_line1', 'address_line2',
            'city', 'state_province', 'postal_code', 'country', 'timezone',
            'locale', 'star_rating', 'description', 'organization',
        )
