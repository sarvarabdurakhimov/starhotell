"""Manager Daily Operations Reporting View — real-time operational oversight for Hotel Managers."""
from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.common.permissions import IsHotelManager
from apps.bookings.models import Booking, BookingStatus
from apps.rooms.models import Room, RoomStatus
from apps.housekeeping.models import HousekeepingTask, HousekeepingStatus
from apps.memberships.models import HotelMembership
from apps.payments.models import Payment, PaymentStatus


class ManagerOperationsDashboardView(APIView):
    """
    GET /api/v1/reports/hotels/{hotel_id}/reports/operations/
    Comprehensive real-time daily operational data for Hotel Managers:
    - Today's arrivals and departures
    - Live room inventory & status breakdown
    - Housekeeping task counts & overdue tasks
    - Pending check-ins, check-outs, and operational alerts
    - Pending reservation payments (operational level, no owner P&L)
    - Active guest service requests
    """
    permission_classes = [IsHotelManager]

    def get(self, request, hotel_id):
        today = date.today()
        filter_type = request.query_params.get('filter', 'today')

        if filter_type == 'last_7_days':
            range_start = today - timedelta(days=6)
            range_end = today
        elif filter_type == 'this_month':
            range_start = today.replace(day=1)
            range_end = today
        else:
            range_start = today
            range_end = today

        # 1. Room Inventory Breakdown
        total_rooms = Room.objects.filter(hotel_id=hotel_id).count()
        occupied_rooms = Booking.objects.filter(
            hotel_id=hotel_id,
            status=BookingStatus.CHECKED_IN,
        ).values('room_id').distinct().count()

        cleaning_rooms = Room.objects.filter(
            hotel_id=hotel_id,
            status=RoomStatus.CLEANING
        ).count()

        maintenance_rooms = Room.objects.filter(
            hotel_id=hotel_id,
            status__in=[RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_ORDER]
        ).count()

        available_rooms = max(total_rooms - occupied_rooms - cleaning_rooms - maintenance_rooms, 0)
        occupancy_rate = round((occupied_rooms / total_rooms * 100), 1) if total_rooms > 0 else 0.0

        # 2. Arrivals & Departures
        arrivals_qs = Booking.objects.filter(
            hotel_id=hotel_id,
            check_in=today,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING, BookingStatus.CHECKED_IN]
        ).select_related('guest', 'room', 'room__room_type')

        today_arrivals_count = arrivals_qs.count()
        pending_check_ins = arrivals_qs.filter(status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING]).count()

        departures_qs = Booking.objects.filter(
            hotel_id=hotel_id,
            check_out=today,
            status__in=[BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT]
        ).select_related('guest', 'room', 'room__room_type')

        today_departures_count = departures_qs.count()
        pending_check_outs = departures_qs.filter(status=BookingStatus.CHECKED_IN).count()

        # 3. Housekeeping Statuses & Overdue Tasks
        hk_counts = HousekeepingTask.objects.filter(hotel_id=hotel_id).values('status').annotate(count=Count('id'))
        hk_map = {item['status']: item['count'] for item in hk_counts}
        
        dirty_tasks = hk_map.get(HousekeepingStatus.DIRTY, 0)
        in_progress_tasks = hk_map.get(HousekeepingStatus.IN_PROGRESS, 0)
        clean_tasks = hk_map.get(HousekeepingStatus.CLEAN, 0)
        inspected_tasks = hk_map.get(HousekeepingStatus.INSPECTED, 0)

        # Overdue housekeeping tasks (created before today and still dirty/in_progress)
        overdue_tasks = HousekeepingTask.objects.filter(
            hotel_id=hotel_id,
            status__in=[HousekeepingStatus.DIRTY, HousekeepingStatus.IN_PROGRESS],
            created_at__date__lt=today
        ).count()

        # 4. Pending payments for active bookings
        active_bookings = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]
        )
        total_booking_val = active_bookings.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')
        settled_pmts = Payment.objects.filter(
            hotel_id=hotel_id,
            status=PaymentStatus.SUCCEEDED,
            booking__in=active_bookings
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
        pending_balance = max(total_booking_val - settled_pmts, Decimal('0.00'))

        # 5. Operational Alerts Generation
        alerts = []
        if pending_check_ins > 0:
            alerts.append({
                'id': 'alert-arrivals',
                'type': 'info',
                'title': f"{pending_check_ins} ta mehmon kelishi kutilmoqda",
                'message': "Bugun kelishi rejalashtirilgan mehmonlarning xonalarini tayyor holatga keltiring.",
                'link': f"/hotels/{hotel_id}/bookings?filter=confirmed"
            })

        if dirty_tasks > 0:
            alerts.append({
                'id': 'alert-cleaning',
                'type': 'warning',
                'title': f"{dirty_tasks} ta xonada tozalash talab etiladi",
                'message': "Housekeeping xodimlariga zudlik bilan topshiriqlarni biriktiring.",
                'link': f"/hotels/{hotel_id}/housekeeping"
            })

        if maintenance_rooms > 0:
            alerts.append({
                'id': 'alert-maint',
                'type': 'error',
                'title': f"{maintenance_rooms} ta xona ta'mirda",
                'message': "Ushbu xonalarga bron biriktirilmaganini va ta'mir holatini tekshiring.",
                'link': f"/hotels/{hotel_id}/rooms?filter=maintenance"
            })

        if pending_balance > Decimal('0.00'):
            alerts.append({
                'id': 'alert-payments',
                'type': 'warning',
                'title': f"${pending_balance:,.2f} to'lov kutilmoqda",
                'message': "Front Deskda ro'yxatdan o'tayotgan mehmonlar to'lovlarini tekshiring.",
                'link': f"/hotels/{hotel_id}/bookings"
            })

        # 6. Serialized Arrivals & Departures for Instant UI Actions
        arrivals_data = [
            {
                'id': b.id,
                'reference': b.reference,
                'guest_name': b.guest.full_name if b.guest else 'Mehmon',
                'guest_phone': b.guest.phone if b.guest else '',
                'room_number': b.room.room_number if b.room else '-',
                'room_type': b.room.room_type.name if b.room and b.room.room_type else 'Standart',
                'check_in': b.check_in.isoformat(),
                'check_out': b.check_out.isoformat(),
                'status': b.status,
                'total_amount': str(b.total_amount),
                'special_requests': b.special_requests,
            }
            for b in arrivals_qs[:10]
        ]

        departures_data = [
            {
                'id': b.id,
                'reference': b.reference,
                'guest_name': b.guest.full_name if b.guest else 'Mehmon',
                'guest_phone': b.guest.phone if b.guest else '',
                'room_number': b.room.room_number if b.room else '-',
                'room_type': b.room.room_type.name if b.room and b.room.room_type else 'Standart',
                'check_in': b.check_in.isoformat(),
                'check_out': b.check_out.isoformat(),
                'status': b.status,
                'total_amount': str(b.total_amount),
            }
            for b in departures_qs[:10]
        ]

        # 7. Active Staff on Duty
        staff_members = HotelMembership.objects.filter(
            hotel_id=hotel_id,
            is_active=True
        ).select_related('user').values(
            'id', 'role', 'user__first_name', 'user__last_name', 'user__email'
        )[:8]

        staff_list = [
            {
                'id': s['id'],
                'role': s['role'],
                'name': f"{s['user__first_name']} {s['user__last_name']}".strip() or s['user__email'],
                'email': s['user__email'],
            }
            for s in staff_members
        ]

        # 8. Unresolved Guest Special Requests
        special_requests_qs = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]
        ).exclude(special_requests='').select_related('guest', 'room')[:6]

        guest_requests = [
            {
                'booking_id': b.id,
                'guest_name': b.guest.full_name if b.guest else 'Mehmon',
                'room_number': b.room.room_number if b.room else '-',
                'request': b.special_requests,
                'status': b.status,
            }
            for b in special_requests_qs
        ]

        return Response({
            'today': today.isoformat(),
            'filter': filter_type,
            'kpis': {
                'total_rooms': total_rooms,
                'occupied_rooms': occupied_rooms,
                'available_rooms': available_rooms,
                'cleaning_rooms': cleaning_rooms,
                'maintenance_rooms': maintenance_rooms,
                'occupancy_rate': occupancy_rate,
                'today_arrivals': today_arrivals_count,
                'today_departures': today_departures_count,
                'pending_check_ins': pending_check_ins,
                'pending_check_outs': pending_check_outs,
                'dirty_tasks': dirty_tasks,
                'in_progress_tasks': in_progress_tasks,
                'clean_tasks': clean_tasks,
                'inspected_tasks': inspected_tasks,
                'overdue_tasks': overdue_tasks,
                'pending_payments_amount': str(pending_balance),
            },
            'arrivals': arrivals_data,
            'departures': departures_data,
            'alerts': alerts,
            'staff_on_duty': staff_list,
            'guest_requests': guest_requests,
        })
