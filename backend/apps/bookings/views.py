"""Booking API views with tenant isolation."""
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from apps.common.permissions import IsHotelMember
from .models import Booking, BookingStatus
from .serializers import BookingCreateSerializer, BookingSerializer
from . import services


class BookingListCreateView(generics.ListAPIView):
    """GET /api/v1/hotels/{hotel_id}/bookings/"""
    serializer_class = BookingSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        qs = Booking.objects.filter(
            hotel_id=self.kwargs['hotel_id']
        ).select_related('room', 'guest')
        stat = self.request.query_params.get('status')
        if stat:
            qs = qs.filter(status=stat)
        return qs

    def post(self, request, hotel_id):
        """POST /api/v1/hotels/{hotel_id}/bookings/"""
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        booking = services.create_booking(
            hotel_id=hotel_id,
            room_id=d['room_id'],
            guest_id=d['guest_id'],
            check_in=d['check_in'],
            check_out=d['check_out'],
            num_adults=d['num_adults'],
            num_children=d['num_children'],
            special_requests=d.get('special_requests', ''),
            created_by=request.user,
        )
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingDetailView(generics.RetrieveAPIView):
    """GET /api/v1/hotels/{hotel_id}/bookings/{pk}/"""
    serializer_class = BookingSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return Booking.objects.filter(hotel_id=self.kwargs['hotel_id'])


class BookingCheckInView(APIView):
    permission_classes = [IsHotelMember]

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        updated = services.transition_booking(booking, BookingStatus.CHECKED_IN, request.user)
        return Response(BookingSerializer(updated).data)


class BookingCheckOutView(APIView):
    permission_classes = [IsHotelMember]

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        updated = services.transition_booking(booking, BookingStatus.CHECKED_OUT, request.user)
        return Response(BookingSerializer(updated).data)


class BookingCancelView(APIView):
    permission_classes = [IsHotelMember]

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        reason = request.data.get('reason', '')
        booking.cancellation_reason = reason
        booking.save(update_fields=['cancellation_reason'])
        updated = services.transition_booking(booking, BookingStatus.CANCELLED, request.user, notes=reason)
        return Response(BookingSerializer(updated).data)
