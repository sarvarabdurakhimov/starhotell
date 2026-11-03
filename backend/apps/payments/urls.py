from django.urls import path
from . import views
from . import expense_views

app_name = 'payments'

urlpatterns = [
    path('hotels/<int:hotel_id>/payments/', views.HotelPaymentListView.as_view(), name='payment_list'),
    path('hotels/<int:hotel_id>/expenses/', expense_views.ExpenseListCreateView.as_view(), name='expense_list_create'),
    path('hotels/<int:hotel_id>/expenses/<int:expense_id>/approve/', expense_views.ExpenseApproveView.as_view(), name='expense_approve'),
    path('hotels/<int:hotel_id>/expenses/<int:expense_id>/reverse/', expense_views.ExpenseReverseView.as_view(), name='expense_reverse'),
]
