from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            'id', 'idempotency_key', 'status', 'amount', 'currency',
            'refunded_amount', 'provider', 'provider_transaction_id',
            'failure_reason', 'processed_at', 'created_at',
        )
        read_only_fields = fields
