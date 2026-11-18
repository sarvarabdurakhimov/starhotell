from django.apps import AppConfig


class RoomServiceConfig(AppConfig):
    """Orders a checked-in guest places from the Telegram Mini App (water, fruit, towels, food, ...)."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.room_service'
    verbose_name = 'Room service'
