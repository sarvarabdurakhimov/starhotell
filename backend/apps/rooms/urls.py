from django.urls import path
from . import views

app_name = 'rooms'

urlpatterns = [
    path('hotels/<int:hotel_id>/room-types/', views.RoomTypeListCreateView.as_view(), name='room_type_list'),
    path('hotels/<int:hotel_id>/rooms/', views.RoomListCreateView.as_view(), name='room_list'),
    path('hotels/<int:hotel_id>/rooms/<int:pk>/', views.RoomDetailView.as_view(), name='room_detail'),
]
