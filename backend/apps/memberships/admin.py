from django.contrib import admin
from .models import HotelMembership


@admin.register(HotelMembership)
class HotelMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'hotel', 'role', 'is_active', 'created_at')
    list_filter = ('role', 'is_active')
    search_fields = ('user__email', 'hotel__name')
    raw_id_fields = ('user', 'hotel', 'invited_by')
