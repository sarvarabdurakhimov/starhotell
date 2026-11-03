from rest_framework import generics
from apps.common.permissions import IsHotelMember
from .models import Payment
from .serializers import PaymentSerializer


class HotelPaymentListView(generics.ListAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return Payment.objects.filter(hotel_id=self.kwargs['hotel_id'])
