from django.urls import path

from . import views

app_name = 'room_service'

urlpatterns = [
    path('hotels/<int:hotel_id>/items/', views.ItemListView.as_view(), name='items'),
    path('hotels/<int:hotel_id>/items/defaults/', views.DefaultItemsView.as_view(), name='items_defaults'),
    path('hotels/<int:hotel_id>/items/<int:pk>/', views.ItemDetailView.as_view(), name='item'),
    path('hotels/<int:hotel_id>/orders/', views.OrderListView.as_view(), name='orders'),
    path('hotels/<int:hotel_id>/orders/<int:pk>/', views.OrderDetailView.as_view(), name='order'),
]
