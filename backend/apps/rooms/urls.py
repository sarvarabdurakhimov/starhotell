from django.urls import path
from . import views

app_name = 'rooms'

urlpatterns = [
    path('hotels/<int:hotel_id>/room-types/', views.RoomTypeListCreateView.as_view(), name='room_type_list'),
    path('hotels/<int:hotel_id>/room-types/<int:pk>/', views.RoomTypeDetailView.as_view(), name='room_type_detail'),
    path('hotels/<int:hotel_id>/rooms/', views.RoomListCreateView.as_view(), name='room_list'),
    path('hotels/<int:hotel_id>/rooms/<int:pk>/', views.RoomDetailView.as_view(), name='room_detail'),
    path('hotels/<int:hotel_id>/rooms/<int:pk>/overview/', views.RoomOverviewView.as_view(), name='room_overview'),
    path(
        'hotels/<int:hotel_id>/room-types/<int:type_id>/photos/',
        views.RoomTypePhotoListView.as_view(),
        name='room_type_photos',
    ),
    path(
        'hotels/<int:hotel_id>/room-types/<int:type_id>/photos/<int:pk>/',
        views.RoomTypePhotoDetailView.as_view(),
        name='room_type_photo',
    ),
    path('photos/<int:pk>.jpg', views.room_photo_image, name='room_photo_image'),
]
