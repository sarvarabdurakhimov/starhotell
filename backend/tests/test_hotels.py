import pytest
from django.urls import reverse
from rest_framework import status
from apps.hotels.models import Hotel
from apps.memberships.models import HotelMembership, HotelRole


@pytest.mark.django_db
class TestHotelManagement:
    def test_create_hotel_makes_user_owner(self, api_client, user_factory):
        user = user_factory(email='hotelowner@example.com', password='password123')
        api_client.force_authenticate(user=user)

        url = reverse('hotels:create')
        data = {
            'name': 'Silk Road Hotel',
            'city': 'Samarkand',
            'country': 'Uzbekistan',
            'currency': 'USD',
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

        hotel = Hotel.objects.get(name='Silk Road Hotel')
        assert hotel.currency == 'UZS'  # a client-sent currency is ignored: so'm only
        membership = HotelMembership.objects.get(hotel=hotel, user=user)
        assert membership.role == HotelRole.OWNER
        assert membership.is_active is True

    def test_list_hotels_only_returns_user_hotels(self, api_client, hotel_factory, user_factory):
        hotel1, owner1 = hotel_factory(name='Hotel Alpha')
        hotel2, owner2 = hotel_factory(name='Hotel Beta')

        api_client.force_authenticate(user=owner1)
        url = reverse('hotels:list')
        response = api_client.post(url) if False else api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

        names = [h['name'] for h in response.data['results']]
        assert 'Hotel Alpha' in names
        assert 'Hotel Beta' not in names
