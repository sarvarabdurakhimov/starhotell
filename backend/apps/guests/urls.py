from django.urls import path
from . import views

app_name = 'guests'

urlpatterns = [
    path('hotels/<int:hotel_id>/guests/', views.GuestListCreateView.as_view(), name='guest_list'),
    path('hotels/<int:hotel_id>/guests/<int:pk>/', views.GuestDetailView.as_view(), name='guest_detail'),
]
