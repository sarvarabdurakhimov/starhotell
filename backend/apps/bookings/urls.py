from django.urls import path
from . import views

app_name = 'bookings'

urlpatterns = [
    path('hotels/<int:hotel_id>/bookings/', views.BookingListCreateView.as_view(), name='list_create'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/', views.BookingDetailView.as_view(), name='detail'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/check-in/', views.BookingCheckInView.as_view(), name='check_in'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/check-out/', views.BookingCheckOutView.as_view(), name='check_out'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/cancel/', views.BookingCancelView.as_view(), name='cancel'),
]
