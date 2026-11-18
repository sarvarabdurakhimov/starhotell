"""Pytest fixtures for HMS SaaS tests."""
import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.hotels.models import Hotel, HotelSettings
from apps.memberships.models import HotelMembership, HotelRole
from apps.rooms.models import Room, RoomType


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_factory(db):
    def create_user(email="test@example.com", password="password123", **extra):
        return User.objects.create_user(email=email, password=password, **extra)
    return create_user


@pytest.fixture
def hotel_factory(db, user_factory):
    def create_hotel(name="Grand Hotel", owner=None, **extra):
        if owner is None:
            owner = user_factory(email=f"owner_{name.lower().replace(' ', '_')}@example.com")
        from django.utils.text import slugify
        slug = slugify(name)
        hotel = Hotel.objects.create(name=name, slug=slug, **extra)
        HotelSettings.objects.create(hotel=hotel)
        HotelMembership.objects.create(hotel=hotel, user=owner, role=HotelRole.OWNER, is_active=True)
        return hotel, owner
    return create_hotel


@pytest.fixture
def room_setup(db, hotel_factory):
    def setup(hotel):
        room_type = RoomType.objects.create(
            hotel=hotel,
            name="Deluxe Suite",
            base_price="150.00",
            max_occupancy=2,
        )
        room = Room.objects.create(
            hotel=hotel,
            room_type=room_type,
            room_number="101",
            floor=1,
        )
        return room_type, room
    return setup
