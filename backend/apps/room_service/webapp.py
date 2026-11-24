"""Mini App endpoints for a checked-in guest: the menu, placing an order, and the guest's orders."""
from rest_framework import status
from rest_framework.response import Response

from apps.telegram_bot import services as bot_svc
from apps.telegram_bot.webapp import WebAppView

from . import services
from .models import ItemCategory, OrderStatus


def _order(o) -> dict:
    return {
        'id': o.id, 'status': o.status, 'created_at': o.created_at, 'note': o.note,
        'total': bot_svc.uzs_amount(None, o.total), 'is_paid': o.is_paid,
        'lines': [{'name': li.name, 'quantity': li.quantity, 'price': bot_svc.uzs_amount(None, li.price)}
                  for li in o.lines.all()],
        'can_cancel': o.status == OrderStatus.NEW,
    }


class ServicesView(WebAppView):
    """GET .../webapp/{bot_id}/services/: the stay in progress (if any), the menu, and today's orders."""

    def get(self, request, bot_id):
        stay = services.current_stay(self.chat)
        if not stay:
            return Response({'stay': None, 'items': [], 'categories': [], 'orders': []})
        items = services.orderable_items(self.bot.hotel_id)  # sold-out items are hidden
        orders = stay.service_orders.prefetch_related('lines').order_by('-created_at')[:30]
        used = {i.category for i in items}
        return Response({
            'stay': {'room_number': stay.room.room_number, 'check_out': stay.check_out.isoformat(),
                     'reference': stay.reference},
            'categories': [{'value': v, 'label': lbl} for v, lbl in ItemCategory.choices if v in used],
            'items': [{'id': i.id, 'name': i.name, 'category': i.category,
                       'price': bot_svc.uzs_amount(None, i.price)} for i in items],
            'orders': [_order(o) for o in orders],
        })


class PlaceOrderView(WebAppView):
    """POST .../webapp/{bot_id}/services/order/ {"items": [{"id": 1, "quantity": 2}], "note": "..."}"""

    def post(self, request, bot_id):
        order = services.create_order(self.chat, request.data.get('items'), str(request.data.get('note') or ''))
        return Response(_order(order), status=status.HTTP_201_CREATED)


class CancelOrderView(WebAppView):
    """POST .../webapp/{bot_id}/services/orders/{pk}/cancel/ (only while the order is still new)"""

    def post(self, request, bot_id, pk):
        order = (self.chat.service_orders.filter(pk=pk).select_related('room', 'telegram_chat__bot')
                 .prefetch_related('lines').first())
        if not order:
            return Response({'detail': 'Buyurtma topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        services.cancel_by_guest(order)
        return Response(_order(order))
