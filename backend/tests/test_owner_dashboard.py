import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from apps.memberships.models import HotelRole, HotelMembership
from apps.payments.expenses import Expense, ExpenseCategory, ExpenseStatus
from apps.payments.models import Payment, PaymentStatus
from apps.bookings.models import Booking, BookingStatus


@pytest.mark.django_db
class TestOwnerPermissionsAndSecurity:
    """Rigorous tests verifying OWNER capabilities, security protections, and isolation."""

    def test_manager_cannot_promote_to_owner(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)

        # Attempt to invite an owner
        url = reverse('memberships:invite', kwargs={'hotel_id': hotel.id})
        response = api_client.post(url, {'email': 'hacker@starhotel.com', 'role': 'owner'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_cannot_appoint_another_manager(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        manager_user = user_factory(email='manager@starhotel.com')
        other_user = user_factory(email='receptionist@starhotel.com')

        HotelMembership.objects.create(
            hotel=hotel,
            user=manager_user,
            role=HotelRole.MANAGER,
            is_active=True
        )

        api_client.force_authenticate(user=manager_user)

        url = reverse('memberships:invite', kwargs={'hotel_id': hotel.id})
        response = api_client.post(url, {'email': other_user.email, 'role': 'manager'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_owner_can_appoint_manager(self, api_client, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        target_user = user_factory(email='new_manager@starhotel.com')

        api_client.force_authenticate(user=owner)

        url = reverse('memberships:invite', kwargs={'hotel_id': hotel.id})
        response = api_client.post(url, {'email': target_user.email, 'role': 'manager'})
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['role'] == 'manager'

    def test_expense_auditable_reversal(self, api_client, hotel_factory):
        hotel, owner = hotel_factory(name='StarHotel Grand')
        expense = Expense.objects.create(
            hotel=hotel,
            category=ExpenseCategory.MAINTENANCE,
            title='HVAC compressor replacement',
            amount=Decimal('1200.00'),
            expense_date=date.today(),
            recorded_by=owner,
            status=ExpenseStatus.APPROVED
        )

        api_client.force_authenticate(user=owner)

        reverse_url = reverse('payments:expense_reverse', kwargs={'hotel_id': hotel.id, 'expense_id': expense.id})

        # Must require reason
        resp_no_reason = api_client.post(reverse_url, {'reason': ''})
        assert resp_no_reason.status_code == status.HTTP_400_BAD_REQUEST

        # Reversal succeeds with reason
        resp_valid = api_client.post(reverse_url, {'reason': 'Supplier refunded double billed invoice'})
        assert resp_valid.status_code == status.HTTP_200_OK
        expense.refresh_from_db()
        assert expense.status == ExpenseStatus.REVERSED
        assert expense.reversal_reason == 'Supplier refunded double billed invoice'
        assert expense.reversed_by == owner

    def test_owner_executive_report_isolation(self, api_client, hotel_factory):
        hotel_a, owner_a = hotel_factory(name='StarHotel Palace')
        hotel_b, owner_b = hotel_factory(name='StarHotel Resort')

        api_client.force_authenticate(user=owner_a)

        # Owner A accessing Hotel B's executive dashboard must be forbidden
        url = reverse('reports:executive', kwargs={'hotel_id': hotel_b.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
