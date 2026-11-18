from django.apps import AppConfig


class AssistantConfig(AppConfig):
    """Owner's Telegram assistant: answers questions about the project's task and change history."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.assistant'
    verbose_name = 'Claude assistant'
