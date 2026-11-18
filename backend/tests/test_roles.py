"""Staff roles are enforced by the API, not only by hidden pages; guest ID numbers stay private."""
from datetime import date, timedelta

import pytest
from django.urls import reverse
from rest_framework import status

from apps.bookings.models import BookingStatus
from apps.bookings.services import create_booking
from apps.guests.models import Guest
from apps.memberships.models import HotelMembership, HotelRole


@pytest.fixture
def staffed_hotel(hotel_factory, user_factory, room_setup):
    """A hotel with one confirmed booking and one member of every staff role."""
    hotel, owner = hotel_factory(name='Role Hotel')
    _, room = room_setup(hotel)
    guest = Guest.objects.create(hotel=hotel, first_name='Aziz', last_name='Karimov', id_number='AA1234567')
    booking = create_booking(
        hotel_id=hotel.id, room_id=room.id, guest_id=guest.id,
        check_in=date.today(), check_out=date.today() + timedelta(days=2),
        num_adults=1, num_children=0, special_requests='', created_by=owner,
    )
    staff = {}
    for role in (HotelRole.RECEPTIONIST, HotelRole.HOUSEKEEPING, HotelRole.FINANCE, HotelRole.AUDITOR):
        user = user_factory(email=f'{role}@example.com')
        HotelMembership.objects.create(hotel=hotel, user=user, role=role, is_active=True)
        staff[role] = user
    return hotel, owner, room, guest, booking, staff


@pytest.mark.django_db
class TestRoleEnforcement:
    @pytest.mark.parametrize('role', [HotelRole.HOUSEKEEPING, HotelRole.FINANCE, HotelRole.AUDITOR])
    def test_non_front_desk_cannot_change_bookings(self, api_client, staffed_hotel, role):
        hotel, _, room, guest, booking, staff = staffed_hotel
        api_client.force_authenticate(user=staff[role])
        kw = {'hotel_id': hotel.id, 'pk': booking.id}
        for name in ('bookings:cancel', 'bookings:check_in', 'bookings:check_out'):
            res = api_client.post(reverse(name, kwargs=kw), {'reason': 'x'})
            assert res.status_code == status.HTTP_403_FORBIDDEN, name
        create = api_client.post(reverse('bookings:list_create', kwargs={'hotel_id': hotel.id}), {
            'room_id': room.id, 'guest_id': guest.id, 'num_adults': 1,
            'check_in': str(date.today() + timedelta(days=10)), 'check_out': str(date.today() + timedelta(days=11)),
        })
        assert create.status_code == status.HTTP_403_FORBIDDEN
        booking.refresh_from_db()
        assert booking.status == BookingStatus.CONFIRMED

    @pytest.mark.parametrize('role', [HotelRole.HOUSEKEEPING, HotelRole.FINANCE, HotelRole.AUDITOR])
    def test_every_staff_role_can_still_view_bookings(self, api_client, staffed_hotel, role):
        hotel, *_, staff = staffed_hotel
        api_client.force_authenticate(user=staff[role])
        assert api_client.get(reverse('bookings:list_create', kwargs={'hotel_id': hotel.id})).status_code == 200
        assert api_client.get(reverse('bookings:calendar', kwargs={'hotel_id': hotel.id})).status_code == 200

    def test_receptionist_can_check_in_and_cancel(self, api_client, staffed_hotel):
        hotel, _, _, _, booking, staff = staffed_hotel
        api_client.force_authenticate(user=staff[HotelRole.RECEPTIONIST])
        kw = {'hotel_id': hotel.id, 'pk': booking.id}
        assert api_client.post(reverse('bookings:check_in', kwargs=kw)).status_code == status.HTTP_200_OK
        booking.refresh_from_db()
        assert booking.status == BookingStatus.CHECKED_IN

    @pytest.mark.parametrize('role', [HotelRole.HOUSEKEEPING, HotelRole.FINANCE, HotelRole.AUDITOR])
    def test_guest_records_are_front_desk_only(self, api_client, staffed_hotel, role):
        hotel, _, _, guest, _, staff = staffed_hotel
        api_client.force_authenticate(user=staff[role])
        assert api_client.get(reverse('guests:guest_list', kwargs={'hotel_id': hotel.id})).status_code == 403
        history = reverse('guests:guest_history', kwargs={'hotel_id': hotel.id, 'pk': guest.id})
        assert api_client.get(history).status_code == 403

    def test_auditor_cannot_edit_housekeeping_but_housekeeper_can_view(self, api_client, staffed_hotel):
        hotel, *_, staff = staffed_hotel
        url = reverse('housekeeping:task_list', kwargs={'hotel_id': hotel.id})
        api_client.force_authenticate(user=staff[HotelRole.AUDITOR])
        assert api_client.post(url, {}).status_code == status.HTTP_403_FORBIDDEN
        api_client.force_authenticate(user=staff[HotelRole.HOUSEKEEPING])
        assert api_client.get(url).status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestGuestIdPrivacy:
    def test_id_number_is_never_returned_only_a_hint(self, api_client, staffed_hotel):
        hotel, owner, _, guest, _, _ = staffed_hotel
        api_client.force_authenticate(user=owner)
        listed = api_client.get(reverse('guests:guest_list', kwargs={'hotel_id': hotel.id})).data['results'][0]
        detail = api_client.get(reverse('guests:guest_detail', kwargs={'hotel_id': hotel.id, 'pk': guest.id})).data
        for data in (listed, detail):
            assert 'id_number' not in data
            assert data['id_number_hint'] == '••••4567'
            assert 'AA1234567' not in str(data)

    def test_id_number_can_still_be_recorded(self, api_client, staffed_hotel):
        hotel, _, _, _, _, staff = staffed_hotel
        api_client.force_authenticate(user=staff[HotelRole.RECEPTIONIST])
        res = api_client.post(reverse('guests:guest_list', kwargs={'hotel_id': hotel.id}),
                              {'first_name': 'Olim', 'last_name': 'Valiev', 'id_number': 'AB7654321'})
        assert res.status_code == status.HTTP_201_CREATED
        assert 'id_number' not in res.data
        assert Guest.objects.get(first_name='Olim').id_number == 'AB7654321'
