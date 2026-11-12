from django.urls import path
from . import views

app_name = 'guests'

urlpatterns = [
    path('hotels/<int:hotel_id>/guests/', views.GuestListCreateView.as_view(), name='guest_list'),
    path('hotels/<int:hotel_id>/guests/<int:pk>/', views.GuestDetailView.as_view(), name='guest_detail'),
    path('hotels/<int:hotel_id>/guests/<int:pk>/history/', views.GuestHistoryView.as_view(), name='guest_history'),
    path('hotels/<int:hotel_id>/guests/<int:pk>/blacklist/', views.GuestBlacklistView.as_view(), name='guest_blacklist'),
]
