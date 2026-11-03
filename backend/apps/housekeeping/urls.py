from django.urls import path
from . import views

app_name = 'housekeeping'

urlpatterns = [
    path('hotels/<int:hotel_id>/housekeeping/', views.HousekeepingTaskListCreateView.as_view(), name='task_list'),
    path('hotels/<int:hotel_id>/housekeeping/<int:pk>/', views.HousekeepingTaskDetailView.as_view(), name='task_detail'),
]
