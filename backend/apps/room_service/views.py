"""Panel API: the hotel's room-service menu (owner / manager) and guests' orders (front desk, housekeeping)."""
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import HotelRoleAccess, IsHotelManager

from . import services
from .models import ItemCategory, OrderStatus, ServiceItem, ServiceOrder

# Who sees and handles orders: front desk and housekeeping deliver; finance / auditor may look
ORDER_READERS = ('receptionist', 'housekeeping', 'finance', 'auditor')
ORDER_HANDLERS = ('receptionist', 'housekeeping')


class ServiceItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = ServiceItem
        fields = ('id', 'name', 'category', 'category_display', 'price', 'is_active', 'position')

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Narx manfiy bo'lishi mumkin emas.")
        return value

    def validate_name(self, value):
        value = value.strip()
        hotel_id = self.context['hotel_id']
        clash = ServiceItem.objects.filter(hotel_id=hotel_id, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('Bu nomli narsa menyuda bor.')
        return value


def order_data(o: ServiceOrder) -> dict:
    guest = o.booking.guest
    return {
        'id': o.id, 'status': o.status, 'status_display': o.get_status_display(),
        'room_number': o.room.room_number, 'guest_name': guest.full_name, 'guest_phone': guest.phone,
        'booking_reference': o.booking.reference, 'note': o.note, 'total': o.total, 'is_paid': o.is_paid,
        'lines': [{'name': li.name, 'price': li.price, 'quantity': li.quantity} for li in o.lines.all()],
        'created_at': o.created_at, 'delivered_at': o.delivered_at,
        'handled_by': o.handled_by.get_full_name() if o.handled_by else None,
    }


class ItemListView(APIView):
    """GET/POST /api/v1/room-service/hotels/{hotel_id}/items/"""
    permission_classes = [HotelRoleAccess]
    read_roles = ORDER_READERS

    def get_permissions(self):
        return [IsHotelManager()] if self.request.method == 'POST' else super().get_permissions()

    def get(self, request, hotel_id):
        items = ServiceItem.objects.filter(hotel_id=hotel_id)
        return Response({
            'items': ServiceItemSerializer(items, many=True).data,
            'categories': [{'value': v, 'label': lbl} for v, lbl in ItemCategory.choices],
        })

    def post(self, request, hotel_id):
        s = ServiceItemSerializer(data=request.data, context={'hotel_id': hotel_id})
        s.is_valid(raise_exception=True)
        s.save(hotel_id=hotel_id)
        return Response(s.data, status=status.HTTP_201_CREATED)


class ItemDetailView(APIView):
    """PATCH/DELETE /api/v1/room-service/hotels/{hotel_id}/items/{pk}/ (owner / manager)"""
    permission_classes = [IsHotelManager]

    def patch(self, request, hotel_id, pk):
        item = get_object_or_404(ServiceItem, pk=pk, hotel_id=hotel_id)
        s = ServiceItemSerializer(item, data=request.data, partial=True, context={'hotel_id': hotel_id})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)

    def delete(self, request, hotel_id, pk):
        item = get_object_or_404(ServiceItem, pk=pk, hotel_id=hotel_id)
        item.delete()  # past orders keep their own copy of the name and price
        return Response(status=status.HTTP_204_NO_CONTENT)


class DefaultItemsView(APIView):
    """POST /api/v1/room-service/hotels/{hotel_id}/items/defaults/: fill an empty menu with common items."""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id):
        added = services.add_default_items(hotel_id)
        if not added:
            return Response({'detail': "Menyu bo'sh emas."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'added': added}, status=status.HTTP_201_CREATED)


class OrderListView(APIView):
    """GET /api/v1/room-service/hotels/{hotel_id}/orders/?status=new|accepted|delivered|cancelled|open"""
    permission_classes = [HotelRoleAccess]
    read_roles = ORDER_READERS

    def get(self, request, hotel_id):
        qs = (ServiceOrder.objects.filter(hotel_id=hotel_id)
              .select_related('room', 'booking__guest', 'handled_by').prefetch_related('lines'))
        wanted = request.query_params.get('status', 'open')
        if wanted == 'open':
            qs = qs.filter(status__in=[OrderStatus.NEW, OrderStatus.ACCEPTED])
        elif wanted in OrderStatus.values:
            qs = qs.filter(status=wanted)
        return Response([order_data(o) for o in qs[:200]])


class OrderDetailView(APIView):
    """PATCH /api/v1/room-service/hotels/{hotel_id}/orders/{pk}/ with {"status": ...} and/or {"is_paid": bool}"""
    permission_classes = [HotelRoleAccess]
    write_roles = ORDER_HANDLERS

    def patch(self, request, hotel_id, pk):
        orders = ServiceOrder.objects.select_related('room', 'booking__guest', 'telegram_chat__bot')
        order = get_object_or_404(orders, pk=pk, hotel_id=hotel_id)
        if 'status' in request.data:
            services.set_status(order, str(request.data['status']), request.user)
        if 'is_paid' in request.data:
            order.is_paid = bool(request.data['is_paid'])
            order.save(update_fields=['is_paid', 'updated_at'])
        return Response(order_data(order))
