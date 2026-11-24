from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsHotelMember, IsHotelManager
from .models import Room, RoomType, RoomTypePhoto
from .serializers import RoomSerializer, RoomTypeSerializer


class RoomTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomTypeSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        return RoomType.objects.filter(hotel_id=self.kwargs['hotel_id'])

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class RoomListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        qs = Room.objects.filter(hotel_id=self.kwargs['hotel_id']).select_related('room_type')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class RoomDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = RoomSerializer

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsHotelManager()]
        return [IsHotelMember()]

    def get_queryset(self):
        return Room.objects.filter(hotel_id=self.kwargs['hotel_id'])


class RoomOverviewView(APIView):
    """
    GET /api/v1/rooms/hotels/{hotel_id}/rooms/{pk}/overview/
    Everything staff need about one room: who is in it, who arrives or leaves next,
    cleaning state, recent stays and 30-day numbers.
    """
    permission_classes = [IsHotelMember]

    def get(self, request, hotel_id, pk):
        from apps.bookings.models import Booking, BookingStatus
        from apps.housekeeping.models import HousekeepingStatus, HousekeepingTask
        from apps.payments.models import PaymentStatus

        room = get_object_or_404(
            Room.objects.select_related('room_type'), pk=pk, hotel_id=hotel_id
        )
        today = timezone.localdate()
        bookings = Booking.objects.filter(room=room).select_related('guest')

        def paid_for(booking):
            totals = booking.payments.filter(
                status__in=[PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED]
            ).aggregate(amount=Sum('amount'), refunded=Sum('refunded_amount'))
            return (totals['amount'] or Decimal('0')) - (totals['refunded'] or Decimal('0'))

        def stay(b, with_money=False):
            if b is None:
                return None
            data = {
                'id': b.id,
                'reference': b.reference,
                'status': b.status,
                'guest_id': b.guest_id,
                'guest_name': b.guest.full_name,
                'guest_phone': b.guest.phone,
                'guest_email': b.guest.email,
                'guest_nationality': b.guest.nationality,
                'is_vip': b.guest.is_vip,
                'check_in': b.check_in,
                'check_out': b.check_out,
                'nights': (b.check_out - b.check_in).days,
                'num_adults': b.num_adults,
                'num_children': b.num_children,
                'total_amount': b.total_amount,
                'currency': b.currency,
                'special_requests': b.special_requests,
                'actual_check_in': b.actual_check_in,
                'actual_check_out': b.actual_check_out,
            }
            if with_money:
                paid = paid_for(b)
                data['paid_amount'] = paid
                data['balance_due'] = max(b.total_amount - paid, Decimal('0'))
            return data

        current = bookings.filter(status=BookingStatus.CHECKED_IN).order_by('check_in').first()
        upcoming = list(
            bookings.filter(
                status__in=[BookingStatus.PENDING, BookingStatus.CONFIRMED], check_out__gt=today
            ).order_by('check_in')[:5]
        )
        history = bookings.filter(status=BookingStatus.CHECKED_OUT).order_by('-check_out')[:5]

        tasks = HousekeepingTask.objects.filter(room=room).select_related('assigned_to')
        active_task = tasks.exclude(status=HousekeepingStatus.INSPECTED).order_by('-created_at').first()
        last_cleaned = tasks.filter(
            status__in=[HousekeepingStatus.CLEAN, HousekeepingStatus.INSPECTED]
        ).order_by('-updated_at').first()

        def task(t):
            if t is None:
                return None
            return {
                'id': t.id,
                'status': t.status,
                'notes': t.notes,
                'assigned_to_name': t.assigned_to.full_name if t.assigned_to else None,
                'created_at': t.created_at,
                'updated_at': t.updated_at,
                'completed_at': t.completed_at,
            }

        # Nights sold in the last 30 days (intervals clipped to the window)
        start = today - timedelta(days=30)
        nights_30d = 0
        revenue_30d = Decimal('0')
        for b in bookings.filter(
            status__in=[BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
            check_in__lt=today, check_out__gt=start,
        ):
            end = min(b.check_out, today)
            if b.actual_check_out:  # guest may have left early
                end = min(end, timezone.localdate(b.actual_check_out))
            nights = max((end - max(b.check_in, start)).days, 0)
            nights_30d += nights
            revenue_30d += b.rate_per_night * nights

        return Response({
            'room': RoomSerializer(room, context={'view': self}).data,
            'today': today,
            'current_stay': stay(current, with_money=True),
            'departs_today': bool(current and current.check_out <= today),
            'next_arrival': stay(upcoming[0]) if upcoming else None,
            'arrives_today': bool(upcoming and upcoming[0].check_in <= today),
            'upcoming': [stay(b) for b in upcoming],
            'history': [stay(b) for b in history],
            'housekeeping': {
                'active_task': task(active_task),
                'last_cleaned': task(last_cleaned),
            },
            'stats': {
                'nights_30d': nights_30d,
                'occupancy_30d': round(nights_30d / 30 * 100),
                'revenue_30d': revenue_30d,
                'total_stays': bookings.filter(status=BookingStatus.CHECKED_OUT).count(),
            },
        })


MAX_PHOTOS = 8
MAX_UPLOAD = 10 * 1024 * 1024


def _to_jpeg(upload):
    """Resize to at most 1600px and re-encode as JPEG. Returns (bytes, width, height) or None."""
    from io import BytesIO
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        img = Image.open(upload)
        img = ImageOps.exif_transpose(img).convert('RGB')
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    img.thumbnail((1600, 1600))
    out = BytesIO()
    img.save(out, 'JPEG', quality=85, optimize=True)
    return out.getvalue(), img.width, img.height


def photo_url(photo_id: int) -> str:
    return f'/api/v1/rooms/photos/{photo_id}.jpg'


class RoomTypePhotoListView(APIView):
    """GET/POST /api/v1/rooms/hotels/{hotel_id}/room-types/{type_id}/photos/ (multipart field: image)."""

    def get_permissions(self):
        return [IsHotelManager()] if self.request.method == 'POST' else [IsHotelMember()]

    def get(self, request, hotel_id, type_id):
        rt = get_object_or_404(RoomType, pk=type_id, hotel_id=hotel_id)
        return Response([{'id': p.id, 'url': photo_url(p.id)} for p in rt.photos.only('id', 'position')])

    def post(self, request, hotel_id, type_id):
        rt = get_object_or_404(RoomType, pk=type_id, hotel_id=hotel_id)
        files = request.FILES.getlist('image')
        if not files:
            return Response({'detail': 'Rasm tanlang.'}, status=400)
        room_left = MAX_PHOTOS - rt.photos.count()
        if len(files) > room_left:
            return Response(
                {
                    'detail': f"Bitta xona turiga ko'pi bilan {MAX_PHOTOS} ta rasm. "
                    f"Yana {max(room_left, 0)} ta qo'shish mumkin."
                },
                status=400,
            )
        created = []
        last = rt.photos.order_by('-position').values_list('position', flat=True).first() or 0
        for i, f in enumerate(files, start=1):
            if f.size > MAX_UPLOAD:
                return Response({'detail': f"{f.name}: rasm 10 MB dan katta."}, status=400)
            converted = _to_jpeg(f)
            if not converted:
                return Response({'detail': f"{f.name}: bu rasm fayli emas."}, status=400)
            data, w, h = converted
            p = RoomTypePhoto.objects.create(room_type=rt, image=data, width=w, height=h, position=last + i)
            created.append({'id': p.id, 'url': photo_url(p.id)})
        return Response(created, status=201)


class RoomTypePhotoDetailView(APIView):
    """DELETE /api/v1/rooms/hotels/{hotel_id}/room-types/{type_id}/photos/{pk}/"""
    permission_classes = [IsHotelManager]

    def delete(self, request, hotel_id, type_id, pk):
        get_object_or_404(RoomTypePhoto, pk=pk, room_type_id=type_id, room_type__hotel_id=hotel_id).delete()
        return Response(status=204)


def room_photo_image(request, pk):
    """GET /api/v1/rooms/photos/{pk}.jpg — public: these are the same photos guests see in the bot."""
    from django.http import Http404, HttpResponse
    photo = RoomTypePhoto.objects.filter(pk=pk).only('image').first()
    if not photo:
        raise Http404
    resp = HttpResponse(bytes(photo.image), content_type='image/jpeg')
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


class RoomTypeDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/rooms/hotels/{hotel_id}/room-types/{pk}/"""
    serializer_class = RoomTypeSerializer

    def get_permissions(self):
        return [IsHotelManager()] if self.request.method in ('PUT', 'PATCH') else [IsHotelMember()]

    def get_queryset(self):
        return RoomType.objects.filter(hotel_id=self.kwargs['hotel_id'])
