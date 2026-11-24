"""Serializer & API views for Expense management and auditable reversals."""
from rest_framework import serializers, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.common.permissions import IsHotelOwner, IsHotelManager
from .expenses import Expense, ExpenseStatus


class ExpenseSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id',
            'hotel',
            'category',
            'category_display',
            'title',
            'description',
            'amount',
            'currency',
            'expense_date',
            'status',
            'status_display',
            'recorded_by',
            'recorded_by_name',
            'approved_by',
            'reversal_reason',
            'created_at',
        ]
        read_only_fields = ['hotel', 'recorded_by', 'approved_by', 'reversed_by', 'created_at']


class ExpenseListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/payments/hotels/{hotel_id}/expenses/
    POST /api/v1/payments/hotels/{hotel_id}/expenses/
    List or record new operational expenses.
    """
    serializer_class = ExpenseSerializer
    permission_classes = [IsHotelManager]

    def get_queryset(self):
        hotel_id = self.kwargs['hotel_id']
        qs = Expense.objects.filter(hotel_id=hotel_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs.select_related('recorded_by')

    def perform_create(self, serializer):
        hotel_id = self.kwargs['hotel_id']
        serializer.save(
            hotel_id=hotel_id,
            recorded_by=self.request.user,
            status=(
                ExpenseStatus.APPROVED
                if hasattr(self.request.user, 'hotel_memberships')
                and self.request.user.hotel_memberships.filter(hotel_id=hotel_id, role='owner').exists()
                else ExpenseStatus.PENDING_APPROVAL
            ),
        )


class ExpenseApproveView(APIView):
    """
    POST /api/v1/payments/hotels/{hotel_id}/expenses/{expense_id}/approve/
    Strictly OWNER permission: Approve pending operational expense.
    """
    permission_classes = [IsHotelOwner]

    def post(self, request, hotel_id, expense_id):
        try:
            expense = Expense.objects.get(id=expense_id, hotel_id=hotel_id)
        except Expense.DoesNotExist:
            return Response({'detail': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)

        if expense.status == ExpenseStatus.REVERSED:
            return Response({'detail': 'Reversed expenses cannot be approved.'}, status=status.HTTP_400_BAD_REQUEST)

        expense.status = ExpenseStatus.APPROVED
        expense.approved_by = request.user
        expense.save(update_fields=['status', 'approved_by', 'updated_at'])
        return Response(ExpenseSerializer(expense).data)


class ExpenseReverseView(APIView):
    """
    POST /api/v1/payments/hotels/{hotel_id}/expenses/{expense_id}/reverse/
    Traceable reversal of an expense (financial records cannot be permanently deleted).
    """
    permission_classes = [IsHotelOwner]

    def post(self, request, hotel_id, expense_id):
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'detail': 'An auditable reversal reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            expense = Expense.objects.get(id=expense_id, hotel_id=hotel_id)
        except Expense.DoesNotExist:
            return Response({'detail': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)

        if expense.status == ExpenseStatus.REVERSED:
            return Response({'detail': 'Expense has already been reversed.'}, status=status.HTTP_400_BAD_REQUEST)

        expense.status = ExpenseStatus.REVERSED
        expense.reversal_reason = reason
        expense.reversed_by = request.user
        expense.save(update_fields=['status', 'reversal_reason', 'reversed_by', 'updated_at'])
        return Response(ExpenseSerializer(expense).data)
