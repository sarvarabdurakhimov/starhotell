from django.urls import path
from . import views

app_name = 'organizations'

urlpatterns = [
    path('', views.OrganizationListCreateView.as_view(), name='list_create'),
    path('<int:pk>/', views.OrganizationDetailView.as_view(), name='detail'),
]
