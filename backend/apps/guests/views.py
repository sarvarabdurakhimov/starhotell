from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, F, Max, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from apps.common.permissions import IsHotelManager, IsHotelMember
from .models import Guest
from .serializers import GuestSerializer


def with_history(qs):
    """Add visit stats: finished stays, bookings, cancellations, money kept (paid minus refunded), last visit, rating."""
    from apps.bookings.models import BookingStatus
    from apps.payments.models import Payment
    from apps.payments.refunds import PAID_STATUSES

    money = DecimalField(max_digits=12, decimal_places=2)
    paid = (
        Payment.objects.filter(booking__guest=OuterRef('pk'), status__in=PAID_STATUSES)
        .values('booking__guest')
        .annotate(total=Sum(F('amount') - F('refunded_amount'), output_field=money))
        .values('total')
    )
    return qs.annotate(
        stays=Count('bookings', filter=Q(bookings__status=BookingStatus.CHECKED_OUT), distinct=True),
        bookings_count=Count('bookings', distinct=True),
        cancellations=Count('bookings', filter=Q(bookings__status__in=[BookingStatus.CANCELLED, BookingStatus.NO_SHOW]), distinct=True),
        last_visit=Max('bookings__check_in', filter=Q(bookings__status__in=[BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT])),
        total_paid=Coalesce(Subquery(paid, output_field=money), Value(Decimal('0')), output_field=money),
        avg_rating=Avg('reviews__rating'),
    )


class GuestListCreateView(generics.ListCreateAPIView):
    serializer_class = GuestSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        qs = Guest.objects.filter(hotel_id=self.kwargs['hotel_id'])
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )
        return with_history(qs).order_by('last_name', 'first_name')

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class GuestDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = GuestSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return with_history(Guest.objects.filter(hotel_id=self.kwargs['hotel_id']))


class GuestHistoryView(APIView):
    """GET .../guests/{pk}/history/ — the guest's profile with stats, every booking, and their reviews."""
    permission_classes = [IsHotelMember]

    def get(self, request, hotel_id, pk):
        from apps.bookings.models import Booking
        from apps.bookings.serializers import BookingSerializer
        guest = with_history(Guest.objects.filter(hotel_id=hotel_id, pk=pk)).first()
        if not guest:
            raise NotFound('Guest not found.')
        bookings = (
            Booking.objects.filter(hotel_id=hotel_id, guest=guest)
            .select_related('room__room_type', 'guest', 'review').prefetch_related('payments')
            .order_by('-check_in')
        )
        rows = []
        for b in bookings:
            row = BookingSerializer(b).data
            row['room_type'] = b.room.room_type.name
            review = getattr(b, 'review', None)  # missing review raises an AttributeError subclass
            row['review_comment'] = review.comment if review else ''
            rows.append(row)
        return Response({'guest': GuestSerializer(guest).data, 'bookings': rows})


class GuestBlacklistView(APIView):
    """POST .../guests/{pk}/blacklist/ {blacklisted: bool, reason} — managers and the owner only."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, pk):
        guest = Guest.objects.filter(hotel_id=hotel_id, pk=pk).first()
        if not guest:
            raise NotFound('Guest not found.')
        on = bool(request.data.get('blacklisted'))
        guest.is_blacklisted = on
        guest.blacklist_reason = (request.data.get('reason') or '').strip()[:500] if on else ''
        guest.blacklisted_at = timezone.now() if on else None
        guest.save(update_fields=['is_blacklisted', 'blacklist_reason', 'blacklisted_at', 'updated_at'])
        return Response(GuestSerializer(with_history(Guest.objects.filter(pk=pk)).first()).data)
