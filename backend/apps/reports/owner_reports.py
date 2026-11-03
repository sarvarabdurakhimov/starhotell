"""Executive financial & operational reports scoped strictly to the authorized hotel."""
import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
from django.db.models import Sum, Count, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.common.permissions import IsHotelOwner, IsHotelManager
from apps.bookings.models import Booking, BookingStatus
from apps.rooms.models import Room, RoomStatus
from apps.payments.models import Payment, PaymentStatus
from apps.payments.expenses import Expense, ExpenseStatus


def parse_date_range(request):
    """
    Parses request query params:
    filter: 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
    start_date: YYYY-MM-DD
    end_date: YYYY-MM-DD
    """
    today = date.today()
    filter_type = request.query_params.get('filter', 'this_month')

    if filter_type == 'today':
        start_date = today
        end_date = today
    elif filter_type == 'last_7_days':
        start_date = today - timedelta(days=6)
        end_date = today
    elif filter_type == 'this_month':
        start_date = today.replace(day=1)
        end_date = today
    elif filter_type == 'last_month':
        first_this_month = today.replace(day=1)
        last_day_prev_month = first_this_month - timedelta(days=1)
        start_date = last_day_prev_month.replace(day=1)
        end_date = last_day_prev_month
    elif filter_type == 'custom':
        start_str = request.query_params.get('start_date')
        end_str = request.query_params.get('end_date')
        try:
            start_date = date.fromisoformat(start_str) if start_str else today.replace(day=1)
            end_date = date.fromisoformat(end_str) if end_str else today
        except ValueError:
            start_date = today.replace(day=1)
            end_date = today
    else:
        start_date = today.replace(day=1)
        end_date = today

    return start_date, end_date, filter_type


class OwnerExecutiveDashboardView(APIView):
    """
    GET /api/v1/reports/hotels/{hotel_id}/reports/executive/
    Comprehensive executive metrics strictly for hotel Owners:
    - Today's revenue & period revenue
    - Recorded expenses, refunds, net revenue, estimated profit
    - Room inventory, occupancy rate, today's arrivals & departures
    - Outstanding unpaid balances & operational alerts
    """
    permission_classes = [IsHotelOwner]

    def get(self, request, hotel_id):
        today = date.today()
        start_date, end_date, filter_type = parse_date_range(request)

        # 1. Rooms inventory & real-time occupancy
        total_rooms = Room.objects.filter(hotel_id=hotel_id).count()
        occupied_rooms = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CHECKED_IN, BookingStatus.CONFIRMED],
            check_in__lte=today,
            check_out__gt=today,
        ).values('room_id').distinct().count()
        available_rooms = max(total_rooms - occupied_rooms, 0)
        occupancy_rate = round((occupied_rooms / total_rooms * 100), 1) if total_rooms > 0 else 0.0

        # Maintenance rooms
        maintenance_rooms = Room.objects.filter(
            hotel_id=hotel_id,
            status__in=[RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_ORDER]
        ).count()

        # 2. Today's Arrivals and Departures
        today_arrivals = Booking.objects.filter(
            hotel_id=hotel_id,
            check_in=today,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.PENDING]
        ).count()

        today_departures = Booking.objects.filter(
            hotel_id=hotel_id,
            check_out=today,
            status=BookingStatus.CHECKED_IN
        ).count()

        # 3. Revenue calculations
        # A. Today's settled cash revenue
        today_settled_revenue = Payment.objects.filter(
            hotel_id=hotel_id,
            status=PaymentStatus.SUCCEEDED,
            created_at__date=today
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # B. Selected period settled cash revenue
        period_settled_payments = Payment.objects.filter(
            hotel_id=hotel_id,
            status=PaymentStatus.SUCCEEDED,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # C. Total booking value for period stays
        period_booking_value = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

        # D. Refunds in period
        period_refunds = Payment.objects.filter(
            hotel_id=hotel_id,
            status__in=[PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(total=Sum('refunded_amount'))['total'] or Decimal('0.00')

        # E. Operating Expenses in period (Approved only, excludes reversed)
        period_expenses = Expense.objects.filter(
            hotel_id=hotel_id,
            status=ExpenseStatus.APPROVED,
            expense_date__gte=start_date,
            expense_date__lte=end_date
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # Net Revenue = Settled Revenue - Refunds
        net_revenue = period_settled_payments - period_refunds

        # Estimated Profit = Net Revenue - Operating Expenses
        estimated_profit = net_revenue - period_expenses

        # F. Outstanding / Unpaid booking balances across active bookings
        total_active_booking_value = Booking.objects.filter(
            hotel_id=hotel_id,
            status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

        total_settled_for_active = Payment.objects.filter(
            hotel_id=hotel_id,
            booking__status__in=[BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
            status=PaymentStatus.SUCCEEDED
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        outstanding_balance = max(total_active_booking_value - total_settled_for_active, Decimal('0.00'))

        # 4. Operational Alerts for Owner
        alerts = []
        if outstanding_balance > Decimal('5000.00'):
            alerts.append({
                'type': 'warning',
                'title': 'High Outstanding Balances',
                'message': f'Outstanding balance for active guests is {outstanding_balance:,.2f}. Review front desk payment collections.'
            })

        if occupancy_rate >= 90.0:
            alerts.append({
                'type': 'success',
                'title': 'High Occupancy Peak',
                'message': f'Current occupancy is at {occupancy_rate}%. Consider optimizing dynamic room rate yield.'
            })
        elif occupancy_rate < 30.0 and total_rooms > 0:
            alerts.append({
                'type': 'info',
                'title': 'Low Occupancy Window',
                'message': f'Current occupancy is at {occupancy_rate}%. Review channel distribution and promotional packages.'
            })

        pending_expenses_count = Expense.objects.filter(
            hotel_id=hotel_id,
            status=ExpenseStatus.PENDING_APPROVAL
        ).count()
        if pending_expenses_count > 0:
            alerts.append({
                'type': 'attention',
                'title': 'Pending Expense Approvals',
                'message': f'{pending_expenses_count} expense record(s) awaiting Owner review and approval.'
            })

        # 5. Trend Chart Data (daily points across period)
        days_span = (end_date - start_date).days + 1
        trend_days = []
        # Limit to 31 points max for clean chart rendering
        step = max(1, days_span // 30)
        curr = start_date
        while curr <= end_date:
            day_str = curr.isoformat()
            day_rev = Payment.objects.filter(
                hotel_id=hotel_id,
                status=PaymentStatus.SUCCEEDED,
                created_at__date=curr
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

            day_exp = Expense.objects.filter(
                hotel_id=hotel_id,
                status=ExpenseStatus.APPROVED,
                expense_date=curr
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

            trend_days.append({
                'date': day_str,
                'revenue': float(day_rev),
                'expenses': float(day_exp),
                'profit': float(day_rev - day_exp),
            })
            curr += timedelta(days=step)

        return Response({
            'period': {
                'filter': filter_type,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
            },
            'kpis': {
                'today_revenue': str(today_settled_revenue),
                'period_settled_revenue': str(period_settled_payments),
                'period_booking_value': str(period_booking_value),
                'recorded_expenses': str(period_expenses),
                'refunds': str(period_refunds),
                'net_revenue': str(net_revenue),
                'estimated_profit': str(estimated_profit),
                'outstanding_balance': str(outstanding_balance),
                'total_rooms': total_rooms,
                'occupied_rooms': occupied_rooms,
                'available_rooms': available_rooms,
                'maintenance_rooms': maintenance_rooms,
                'occupancy_rate': occupancy_rate,
                'today_arrivals': today_arrivals,
                'today_departures': today_departures,
            },
            'alerts': alerts,
            'trends': trend_days,
        })


class FinancialReportExportView(APIView):
    """
    GET /api/v1/reports/hotels/{hotel_id}/reports/export/
    Export financial audit and performance data to CSV.
    Strictly restricted to authorized Hotel Owners.
    """
    permission_classes = [IsHotelOwner]

    def get(self, request, hotel_id):
        start_date, end_date, _ = parse_date_range(request)
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="starhotel_financial_report_{hotel_id}_{start_date}_{end_date}.csv"'

        writer = csv.writer(response)
        writer.writerow(['StarHotel Financial Audit Report'])
        writer.writerow(['Hotel ID', hotel_id])
        writer.writerow(['Period', f'{start_date} to {end_date}'])
        writer.writerow([])

        # Section 1: Revenue Transactions
        writer.writerow(['--- REVENUE & SETTLED PAYMENTS ---'])
        writer.writerow(['Date', 'Idempotency Key', 'Booking Ref', 'Provider', 'Amount', 'Currency', 'Status'])

        payments = Payment.objects.filter(
            hotel_id=hotel_id,
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('booking')

        for p in payments:
            writer.writerow([
                p.created_at.strftime('%Y-%m-%d %H:%M'),
                str(p.idempotency_key),
                p.booking.reference if p.booking else 'N/A',
                p.provider,
                p.amount,
                p.currency,
                p.status
            ])

        writer.writerow([])
        # Section 2: Operating Expenses
        writer.writerow(['--- OPERATING EXPENSES ---'])
        writer.writerow(['Expense Date', 'Title', 'Category', 'Amount', 'Currency', 'Status', 'Recorded By'])

        expenses = Expense.objects.filter(
            hotel_id=hotel_id,
            expense_date__gte=start_date,
            expense_date__lte=end_date
        ).select_related('recorded_by')

        for exp in expenses:
            writer.writerow([
                exp.expense_date.isoformat(),
                exp.title,
                exp.get_category_display(),
                exp.amount,
                exp.currency,
                exp.status,
                exp.recorded_by.email if exp.recorded_by else 'System'
            ])

        return response
