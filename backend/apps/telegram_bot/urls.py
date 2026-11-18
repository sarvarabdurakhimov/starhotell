from django.urls import path

from . import views, webapp

app_name = 'telegram_bot'

urlpatterns = [
    path('hotels/<int:hotel_id>/bot/', views.BotConfigView.as_view(), name='bot_config'),
    path('webhook/<int:bot_id>/', views.WebhookView.as_view(), name='webhook'),
    # Telegram Mini App (opened from the hotel's bot; authenticated by Telegram's signed initData)
    path('webapp/<int:bot_id>/info/', webapp.InfoView.as_view(), name='webapp_info'),
    path('webapp/<int:bot_id>/availability/', webapp.AvailabilityView.as_view(), name='webapp_availability'),
    path('webapp/<int:bot_id>/book/', webapp.BookView.as_view(), name='webapp_book'),
    path('webapp/<int:bot_id>/bookings/', webapp.MyBookingsView.as_view(), name='webapp_bookings'),
    path('webapp/<int:bot_id>/bookings/<int:pk>/<str:action>/', webapp.BookingActionView.as_view(),
         name='webapp_booking_action'),
]
