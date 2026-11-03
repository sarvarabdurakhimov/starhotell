from django.db.models import Q
from rest_framework import generics
from apps.common.permissions import IsHotelMember
from .models import Guest
from .serializers import GuestSerializer


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
                Q(email__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        from apps.hotels.models import Hotel
        hotel = Hotel.objects.get(pk=self.kwargs['hotel_id'])
        serializer.save(hotel=hotel)


class GuestDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = GuestSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return Guest.objects.filter(hotel_id=self.kwargs['hotel_id'])
