from django.urls import path
from . import views

app_name = 'memberships'

urlpatterns = [
    path('hotels/<int:hotel_id>/members/', views.HotelMemberListView.as_view(), name='member_list'),
    path('hotels/<int:hotel_id>/members/invite/', views.InviteMemberView.as_view(), name='invite'),
    path('hotels/<int:hotel_id>/members/<int:membership_id>/', views.RevokeMembershipView.as_view(), name='revoke'),
    path('hotels/<int:hotel_id>/members/<int:membership_id>/role/', views.UpdateMemberRoleView.as_view(), name='update_role'),
]
