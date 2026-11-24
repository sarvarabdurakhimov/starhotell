import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from apps.memberships.models import HotelRole, HotelMembership
from apps.bookings.models import Booking, BookingStatus
from apps.rooms.models import RoomStatus


@pytest.mark.django_db
class TestManagerDashboardPermissionsAndOperations:
    """Rigorous tests verifying MANAGER operational capabilities and security protections."""

    def test_manager_can_access_operations_dashboard(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('reports:operations', kwargs={'hotel_id': hotel.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'kpis' in response.data
        assert 'arrivals' in response.data
        assert 'departures' in response.data
        assert 'alerts' in response.data

    def test_manager_cannot_access_owner_executive_report(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('reports:executive', kwargs={'hotel_id': hotel.id})
        response = api_client.get(url)
        # Should be forbidden for manager — strictly owner only
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_export_owner_financials(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('reports:export', kwargs={'hotel_id': hotel.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_promote_anyone_to_owner(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        staff_user = user_factory(email='staff@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('memberships:invite', kwargs={'hotel_id': hotel.id})
        response = api_client.post(url, {'email': staff_user.email, 'role': 'owner'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_revoke_owner(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        owner_membership = HotelMembership.objects.get(hotel=hotel, user=owner)
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('memberships:revoke', kwargs={'hotel_id': hotel.id, 'membership_id': owner_membership.id})
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_room_cannot_be_marked_available_when_guest_checked_in(
        self, api_client, hotel_factory, user_factory, room_factory, guest_factory
    ):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        room = room_factory(hotel=hotel, status=RoomStatus.OCCUPIED)
        guest = guest_factory(hotel=hotel)
        Booking.objects.create(
            hotel=hotel,
            room=room,
            guest=guest,
            status=BookingStatus.CHECKED_IN,
            check_in=date.today(),
            check_out=date.today() + timedelta(days=2),
            rate_per_night=Decimal('100.00'),
            total_amount=Decimal('200.00'),
        )

        api_client.force_authenticate(user=manager_user)
        url = reverse('rooms:room_detail', kwargs={'hotel_id': hotel.id, 'pk': room.id})
        response = api_client.patch(url, {'status': RoomStatus.AVAILABLE})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'status' in response.data
