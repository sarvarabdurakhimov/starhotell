from django.urls import path
from . import views

app_name = 'bookings'

urlpatterns = [
    path('hotels/<int:hotel_id>/bookings/', views.BookingListCreateView.as_view(), name='list_create'),
    path('hotels/<int:hotel_id>/calendar/', views.BookingCalendarView.as_view(), name='calendar'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/', views.BookingDetailView.as_view(), name='detail'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/check-in/', views.BookingCheckInView.as_view(), name='check_in'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/check-out/', views.BookingCheckOutView.as_view(), name='check_out'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/cancel/', views.BookingCancelView.as_view(), name='cancel'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/approve/', views.BookingApproveView.as_view(), name='approve'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/reject/', views.BookingRejectView.as_view(), name='reject'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/keep/', views.BookingKeepView.as_view(), name='keep'),
    path('hotels/<int:hotel_id>/bookings/<int:pk>/refund/', views.BookingRefundView.as_view(), name='refund'),
    path('hotels/<int:hotel_id>/reviews/', views.HotelReviewListView.as_view(), name='reviews'),
]
