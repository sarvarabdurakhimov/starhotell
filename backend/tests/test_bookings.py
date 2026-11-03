from datetime import date, timedelta
import pytest
from django.urls import reverse
from rest_framework import status
from apps.guests.models import Guest
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services import create_booking, transition_booking


@pytest.mark.django_db
class TestBookingOperations:
    def test_prevent_overlapping_booking(self, hotel_factory, room_setup, user_factory):
        hotel, owner = hotel_factory(name='Booking Grand')
        room_type, room = room_setup(hotel)
        guest = Guest.objects.create(hotel=hotel, first_name='John', last_name='Smith')

        today = date.today()
        d1 = today + timedelta(days=1)
        d3 = today + timedelta(days=3)
        d5 = today + timedelta(days=5)

        # Create first booking: Day 1 to Day 3
        b1 = create_booking(
            hotel_id=hotel.id,
            room_id=room.id,
            guest_id=guest.id,
            check_in=d1,
            check_out=d3,
            num_adults=1,
            num_children=0,
            special_requests='',
            created_by=owner,
        )
        assert b1.status == BookingStatus.CONFIRMED

        # Attempt overlapping booking: Day 2 to Day 4 -> Should fail with ValidationError
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            create_booking(
                hotel_id=hotel.id,
                room_id=room.id,
                guest_id=guest.id,
                check_in=d1 + timedelta(days=1),
                check_out=d3 + timedelta(days=1),
                num_adults=1,
                num_children=0,
                special_requests='',
                created_by=owner,
            )

        # Consecutive booking: Day 3 to Day 5 should SUCCEED (departure day is not occupied)
        b2 = create_booking(
            hotel_id=hotel.id,
            room_id=room.id,
            guest_id=guest.id,
            check_in=d3,
            check_out=d5,
            num_adults=1,
            num_children=0,
            special_requests='',
            created_by=owner,
        )
        assert b2.status == BookingStatus.CONFIRMED

    def test_booking_status_transitions(self, hotel_factory, room_setup):
        hotel, owner = hotel_factory(name='Status Hotel')
        room_type, room = room_setup(hotel)
        guest = Guest.objects.create(hotel=hotel, first_name='Alice', last_name='Brown')

        b = create_booking(
            hotel_id=hotel.id,
            room_id=room.id,
            guest_id=guest.id,
            check_in=date.today() + timedelta(days=1),
            check_out=date.today() + timedelta(days=2),
            num_adults=1,
            num_children=0,
            special_requests='',
            created_by=owner,
        )

        # CONFIRMED -> CHECKED_IN
        b = transition_booking(b, BookingStatus.CHECKED_IN, owner)
        assert b.status == BookingStatus.CHECKED_IN
        assert b.actual_check_in is not None

        # CHECKED_IN -> CHECKED_OUT
        b = transition_booking(b, BookingStatus.CHECKED_OUT, owner)
        assert b.status == BookingStatus.CHECKED_OUT
        assert b.actual_check_out is not None

        # Invalid transition: CHECKED_OUT -> CHECKED_IN
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            transition_booking(b, BookingStatus.CHECKED_IN, owner)
