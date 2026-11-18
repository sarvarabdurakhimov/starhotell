"""Booking API views with tenant isolation."""
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, ValidationError

from apps.common.permissions import IsHotelManager, HotelRoleAccess, ALL_STAFF, FRONT_DESK
from .models import Booking, BookingStatus
from .serializers import BookingCreateSerializer, BookingSerializer
from . import services


class BookingListCreateView(generics.ListAPIView):
    """GET /api/v1/hotels/{hotel_id}/bookings/"""
    serializer_class = BookingSerializer
    permission_classes = [HotelRoleAccess]
    read_roles = ALL_STAFF
    write_roles = FRONT_DESK

    def get_queryset(self):
        from apps.telegram_bot.services import expire_stale
        expire_stale(self.kwargs['hotel_id'])  # unpaid Telegram requests lapse here too
        qs = Booking.objects.filter(
            hotel_id=self.kwargs['hotel_id']
        ).select_related('room', 'guest', 'review').prefetch_related('payments')
        guest = self.request.query_params.get('guest')
        if guest and guest.isdigit():
            qs = qs.filter(guest_id=int(guest))
        source = self.request.query_params.get('source')
        if source:
            qs = qs.filter(source=source)
        stat = self.request.query_params.get('status')
        if stat:
            qs = qs.filter(status=stat)
        return qs

    def post(self, request, hotel_id):
        """POST /api/v1/hotels/{hotel_id}/bookings/"""
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        from apps.telegram_bot.services import expire_stale
        expire_stale(hotel_id)  # a lapsed Telegram request must not block the room being booked
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
    permission_classes = [HotelRoleAccess]
    read_roles = ALL_STAFF

    def get_queryset(self):
        return Booking.objects.filter(hotel_id=self.kwargs['hotel_id'])


class BookingCheckInView(APIView):
    permission_classes = [HotelRoleAccess]
    write_roles = FRONT_DESK

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        updated = services.transition_booking(booking, BookingStatus.CHECKED_IN, request.user)
        if updated.telegram_chat_id:
            from apps.room_service.services import welcome_guest
            welcome_guest(updated)  # the bot offers room service (water, towels, food, ...)
        return Response(BookingSerializer(updated).data)


class BookingCheckOutView(APIView):
    permission_classes = [HotelRoleAccess]
    write_roles = FRONT_DESK

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        updated = services.transition_booking(booking, BookingStatus.CHECKED_OUT, request.user)
        if updated.telegram_chat_id:
            from apps.telegram_bot.services import ask_review
            ask_review(updated)  # the bot asks the guest for a 1-5 rating
        return Response(BookingSerializer(updated).data)


class BookingRefundView(APIView):
    """POST .../bookings/{pk}/refund/ {amount, note} — record money given back to the guest."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, pk):
        from apps.payments.refunds import record_refund
        booking = Booking.objects.select_related('telegram_chat__bot__hotel').filter(pk=pk, hotel_id=hotel_id).first()
        if not booking:
            raise NotFound('Booking not found.')
        note = (request.data.get('note') or '').strip()[:300]
        amount = record_refund(booking, request.data.get('amount'), note, request.user)
        if booking.telegram_chat_id:
            from apps.telegram_bot.services import notify_guest, price_text
            notify_guest(booking, 'refunded', amount=price_text(booking.telegram_chat.bot, amount))
        booking = Booking.objects.select_related('room', 'guest', 'review').prefetch_related('payments').get(pk=pk)
        return Response(BookingSerializer(booking).data)


class HotelReviewListView(APIView):
    """GET .../hotels/{hotel_id}/reviews/ — guest ratings with a summary (average and 1-5 counts)."""
    permission_classes = [IsHotelManager]

    def get(self, request, hotel_id):
        from .models import BookingReview
        reviews = list(
            BookingReview.objects.filter(hotel_id=hotel_id)
            .select_related('booking__room__room_type', 'guest')[:300]
        )
        counts = {n: 0 for n in range(1, 6)}
        for r in reviews:
            counts[r.rating] = counts.get(r.rating, 0) + 1
        avg = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else None
        return Response({
            'count': len(reviews),
            'average': avg,
            'counts': counts,
            'results': [{
                'id': r.id, 'rating': r.rating, 'comment': r.comment, 'created_at': r.created_at,
                'booking': r.booking_id, 'reference': r.booking.reference,
                'guest': r.guest_id, 'guest_name': r.guest.full_name,
                'room_number': r.booking.room.room_number, 'room_type': r.booking.room.room_type.name,
                'check_in': r.booking.check_in, 'check_out': r.booking.check_out,
            } for r in reviews],
        })


class BookingCancelView(APIView):
    permission_classes = [HotelRoleAccess]
    write_roles = FRONT_DESK

    def post(self, request, hotel_id, pk):
        try:
            booking = Booking.objects.get(pk=pk, hotel_id=hotel_id)
        except Booking.DoesNotExist:
            raise NotFound('Booking not found.')
        reason = (request.data.get('reason') or '').strip()[:500]
        guest_asked = booking.cancel_requested_at is not None
        if guest_asked and not reason:
            reason = 'Cancelled by guest in Telegram.'
        booking.cancellation_reason = reason
        booking.cancel_requested_at = None
        booking.save(update_fields=['cancellation_reason', 'cancel_requested_at'])
        updated = services.transition_booking(booking, BookingStatus.CANCELLED, request.user, notes=reason)
        if updated.source == 'telegram' and updated.telegram_chat_id:
            from apps.telegram_bot.services import notify_guest, paid_total
            if guest_asked:
                paid = paid_total(updated)
                notify_guest(updated, 'cancel_approved_paid' if paid else 'cancel_approved')
            else:
                label = 'Sabab' if updated.telegram_chat.language == 'uz' else 'Причина'
                notify_guest(updated, 'cancelled_by_hotel', reason=f'\n{label}: {reason}' if reason else '')
        return Response(BookingSerializer(updated).data)


class BookingKeepView(APIView):
    """POST .../bookings/{pk}/keep/ — manager declines the guest's cancellation request; the booking stays."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, pk):
        booking = Booking.objects.select_related('telegram_chat__bot').filter(pk=pk, hotel_id=hotel_id).first()
        if not booking:
            raise NotFound('Booking not found.')
        if booking.cancel_requested_at is None:
            raise ValidationError({'detail': "Bu bron uchun bekor qilish so'rovi yo'q."})
        booking.cancel_requested_at = None
        booking.save(update_fields=['cancel_requested_at', 'updated_at'])
        reason = (request.data.get('reason') or '').strip()[:500]
        if booking.telegram_chat_id:
            from apps.telegram_bot.services import notify_guest
            label = 'Sabab' if booking.telegram_chat.language == 'uz' else 'Причина'
            notify_guest(booking, 'cancel_declined', reason=f'\n{label}: {reason}' if reason else '')
        return Response(BookingSerializer(booking).data)


class BookingCalendarView(APIView):
    """
    GET /api/v1/bookings/hotels/{hotel_id}/calendar/?start=YYYY-MM-DD&days=14
    All rooms plus every booking that overlaps [start, start + days), for the calendar grid.
    Cancelled and no-show bookings are left out.
    """
    permission_classes = [HotelRoleAccess]
    read_roles = ALL_STAFF
    MAX_DAYS = 62

    def get(self, request, hotel_id):
        from datetime import date, timedelta
        from django.utils import timezone
        from rest_framework.exceptions import ValidationError
        from apps.rooms.models import Room
        from apps.telegram_bot.services import expire_stale

        expire_stale(hotel_id)  # lapsed Telegram requests are not shown as occupying rooms
        today = timezone.localdate()
        try:
            start = date.fromisoformat(request.query_params.get('start') or str(today))
            days = int(request.query_params.get('days') or 14)
        except ValueError:
            raise ValidationError({'detail': 'start must be YYYY-MM-DD and days a number.'})
        days = max(1, min(days, self.MAX_DAYS))
        end = start + timedelta(days=days)

        rooms = Room.objects.filter(hotel_id=hotel_id).select_related('room_type').order_by('floor', 'room_number')
        bookings = (
            Booking.objects.filter(hotel_id=hotel_id, check_in__lt=end, check_out__gt=start)
            .exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.NO_SHOW])
            .select_related('guest')
            .order_by('check_in')
        )

        def stay_end(b):
            # A guest who left early frees the room from the day they actually left
            if b.status == BookingStatus.CHECKED_OUT and b.actual_check_out:
                left = timezone.localdate(b.actual_check_out)
                if left < b.check_out:
                    return max(left, b.check_in + timedelta(days=1))
            return b.check_out

        return Response({
            'start': start,
            'end': end,
            'today': today,
            'rooms': [
                {
                    'id': r.id,
                    'room_number': r.room_number,
                    'floor': r.floor,
                    'status': r.status,
                    'room_type_name': r.room_type.name,
                    'base_price': r.room_type.base_price,
                    'max_occupancy': r.room_type.max_occupancy,
                }
                for r in rooms
            ],
            'bookings': [
                {
                    'id': b.id,
                    'reference': b.reference,
                    'room': b.room_id,
                    'status': b.status,
                    'guest_name': b.guest.full_name,
                    'guest_phone': b.guest.phone,
                    'is_vip': b.guest.is_vip,
                    'check_in': b.check_in,
                    'check_out': b.check_out,
                    'display_end': stay_end(b),
                    'nights': (b.check_out - b.check_in).days,
                    'num_adults': b.num_adults,
                    'num_children': b.num_children,
                    'total_amount': b.total_amount,
                    'currency': b.currency,
                    'special_requests': b.special_requests,
                }
                for b in bookings
            ],
        })


class BookingApproveView(APIView):
    """POST .../bookings/{pk}/approve/ — manager accepts a Telegram request (guest is then asked to pay)."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, pk):
        from apps.telegram_bot.services import approve
        booking = Booking.objects.select_related('telegram_chat__bot__hotel', 'room__room_type').filter(
            pk=pk, hotel_id=hotel_id
        ).first()
        if not booking:
            raise NotFound('Booking not found.')
        note = approve(booking, request.user)
        booking.refresh_from_db()
        return Response({**BookingSerializer(booking).data, 'note': note})


class BookingRejectView(APIView):
    """POST .../bookings/{pk}/reject/ — manager declines a Telegram request; the guest is told why."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, pk):
        from apps.telegram_bot.services import reject
        booking = Booking.objects.select_related('telegram_chat__bot').filter(pk=pk, hotel_id=hotel_id).first()
        if not booking:
            raise NotFound('Booking not found.')
        reject(booking, request.user, (request.data.get('reason') or '').strip()[:500])
        booking.refresh_from_db()
        return Response(BookingSerializer(booking).data)
