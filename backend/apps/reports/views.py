"""Reporting and analytics views scoped strictly to the authorized hotel."""
from datetime import date
from django.db.models import Sum, Count
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.common.permissions import IsHotelManager
from apps.bookings.models import Booking, BookingStatus
from apps.rooms.models import Room


class OccupancyReportView(APIView):
    """GET /api/v1/hotels/{hotel_id}/reports/occupancy/"""
    permission_classes = [IsHotelManager]

    def get(self, request, hotel_id):
        target_date_str = request.query_params.get('date')
        if target_date_str:
            try:
                target_date = date.fromisoformat(target_date_str)
            except ValueError:
                target_date = date.today()
        else:
            target_date = date.today()

        total_rooms = Room.objects.filter(hotel_id=hotel_id).count()
        occupied_rooms = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CHECKED_IN, BookingStatus.CONFIRMED],
            check_in__lte=target_date,
            check_out__gt=target_date,
        ).values('room_id').distinct().count()

        rate = (occupied_rooms / total_rooms * 100) if total_rooms > 0 else 0.0

        return Response({
            'date': target_date.isoformat(),
            'total_rooms': total_rooms,
            'occupied_rooms': occupied_rooms,
            'occupancy_rate_percent': round(rate, 2),
        })


class RevenueReportView(APIView):
    """GET /api/v1/hotels/{hotel_id}/reports/revenue/"""
    permission_classes = [IsHotelManager]

    def get(self, request, hotel_id):
        total_revenue = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
        ).aggregate(total=Sum('total_amount'))['total'] or 0

        booking_counts = Booking.objects.filter(hotel_id=hotel_id).values('status').annotate(count=Count('id'))

        return Response({
            'hotel_id': hotel_id,
            'total_revenue': str(total_revenue),
            'bookings_by_status': list(booking_counts),
        })
