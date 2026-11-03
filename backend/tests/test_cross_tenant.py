import pytest
from django.urls import reverse
from rest_framework import status
from apps.guests.models import Guest
from apps.rooms.models import Room, RoomType


@pytest.mark.django_db
class TestCrossTenantDataIsolation:
    """Rigorous tests ensuring Hotel A staff cannot view or modify Hotel B resources."""

    def test_hotel_a_cannot_access_hotel_b_rooms(self, api_client, hotel_factory, room_setup):
        hotel_a, owner_a = hotel_factory(name='Hotel A')
        hotel_b, owner_b = hotel_factory(name='Hotel B')

        room_type_b, room_b = room_setup(hotel_b)

        # Authenticate as owner of Hotel A
        api_client.force_authenticate(user=owner_a)

        # Attempt to access Hotel B's room list
        url = reverse('rooms:room_list', kwargs={'hotel_id': hotel_b.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hotel_a_cannot_access_hotel_b_guests(self, api_client, hotel_factory):
        hotel_a, owner_a = hotel_factory(name='Hotel A')
        hotel_b, owner_b = hotel_factory(name='Hotel B')

        Guest.objects.create(hotel=hotel_b, first_name='Secret', last_name='Guest')

        api_client.force_authenticate(user=owner_a)

        url = reverse('guests:guest_list', kwargs={'hotel_id': hotel_b.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_hotel_a_cannot_access_hotel_b_reports(self, api_client, hotel_factory):
        hotel_a, owner_a = hotel_factory(name='Hotel A')
        hotel_b, owner_b = hotel_factory(name='Hotel B')

        api_client.force_authenticate(user=owner_a)

        url = reverse('reports:revenue', kwargs={'hotel_id': hotel_b.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
