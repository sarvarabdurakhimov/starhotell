from django.urls import path

from . import views

app_name = 'telegram_bot'

urlpatterns = [
    path('hotels/<int:hotel_id>/bot/', views.BotConfigView.as_view(), name='bot_config'),
    path('webhook/<int:bot_id>/', views.WebhookView.as_view(), name='webhook'),
]
