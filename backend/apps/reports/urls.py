from django.urls import path
from . import views
from . import owner_reports
from . import manager_reports

app_name = 'reports'

urlpatterns = [
    path('hotels/<int:hotel_id>/reports/occupancy/', views.OccupancyReportView.as_view(), name='occupancy'),
    path('hotels/<int:hotel_id>/reports/revenue/', views.RevenueReportView.as_view(), name='revenue'),
    path('hotels/<int:hotel_id>/reports/executive/', owner_reports.OwnerExecutiveDashboardView.as_view(), name='executive'),
    path('hotels/<int:hotel_id>/reports/export/', owner_reports.FinancialReportExportView.as_view(), name='export'),
    path('hotels/<int:hotel_id>/reports/operations/', manager_reports.ManagerOperationsDashboardView.as_view(), name='operations'),
]
