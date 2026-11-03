from django.urls import path
from . import views

app_name = 'hotels'

urlpatterns = [
    path('', views.HotelListView.as_view(), name='list'),
    path('create/', views.HotelCreateView.as_view(), name='create'),
    path('<int:hotel_id>/', views.HotelDetailView.as_view(), name='detail'),
]
