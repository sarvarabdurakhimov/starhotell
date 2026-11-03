from django.contrib import admin
from .models import Hotel, HotelSettings


class HotelSettingsInline(admin.StackedInline):
    model = HotelSettings
    can_delete = False


@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'city', 'country', 'is_active', 'created_at')
    list_filter = ('is_active', 'country')
    search_fields = ('name', 'slug', 'city')
    prepopulated_fields = {'slug': ('name',)}
    inlines = [HotelSettingsInline]
