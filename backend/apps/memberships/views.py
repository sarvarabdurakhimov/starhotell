"""Membership management API views."""
import logging
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsHotelManager, IsHotelMember
from apps.users.models import User
from .models import HotelMembership
from .serializers import HotelMembershipSerializer, InviteMemberSerializer

logger = logging.getLogger(__name__)


class HotelMemberListView(generics.ListAPIView):
    """GET /api/v1/hotels/{hotel_id}/members/"""
    serializer_class = HotelMembershipSerializer
    permission_classes = [IsHotelMember]

    def get_queryset(self):
        return HotelMembership.objects.filter(
            hotel_id=self.kwargs['hotel_id'],
            is_active=True,
        ).select_related('user')


class InviteMemberView(APIView):
    """POST /api/v1/hotels/{hotel_id}/members/invite/"""
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id):
        serializer = InviteMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        role = serializer.validated_data['role']

        # Security rule: Only OWNER can assign or invite another OWNER or MANAGER
        # A MANAGER must NEVER be able to promote themselves to OWNER or transfer ownership
        is_owner = HotelMembership.objects.filter(
            hotel_id=hotel_id,
            user=request.user,
            role='owner',
            is_active=True
        ).exists()

        if role == 'owner':
            return Response(
                {'detail': 'Ownership cannot be assigned via invitation. Ownership transfer requires explicit superuser/board action.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if role == 'manager' and not is_owner:
            return Response(
                {'detail': 'Only the Hotel Owner can appoint or invite a Manager.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {'detail': 'No user with that email address exists.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        membership, created = HotelMembership.objects.get_or_create(
            hotel_id=hotel_id,
            user=user,
            defaults={'role': role, 'invited_by': request.user, 'is_active': True},
        )
        if not created:
            if membership.is_active:
                return Response(
                    {'detail': 'User is already a member of this hotel.'},
                    status=status.HTTP_409_CONFLICT,
                )
            membership.is_active = True
            membership.role = role
            membership.invited_by = request.user
            membership.save(update_fields=['is_active', 'role', 'invited_by'])

        logger.info('User %s invited %s to hotel %s with role %s', request.user.email, email, hotel_id, role)
        return Response(HotelMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class UpdateMemberRoleView(APIView):
    """
    PATCH /api/v1/hotels/{hotel_id}/members/{membership_id}/role/
    Strictly OWNER permission: Update an existing staff member's role.
    """
    permission_classes = [IsHotelManager]

    def patch(self, request, hotel_id, membership_id):
        new_role = request.data.get('role')
        if not new_role:
            return Response({'detail': 'role field is required.'}, status=status.HTTP_400_BAD_REQUEST)

        is_owner = HotelMembership.objects.filter(
            hotel_id=hotel_id,
            user=request.user,
            role='owner',
            is_active=True
        ).exists()

        if new_role == 'owner':
            return Response(
                {'detail': 'Cannot promote to Owner. Owner role is protected.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if new_role == 'manager' and not is_owner:
            return Response(
                {'detail': 'Only the Hotel Owner can promote or appoint a Manager.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            membership = HotelMembership.objects.get(id=membership_id, hotel_id=hotel_id, is_active=True)
        except HotelMembership.DoesNotExist:
            return Response({'detail': 'Membership not found.'}, status=status.HTTP_404_NOT_FOUND)

        if membership.role == 'owner':
            return Response({'detail': 'Owner membership cannot be modified.'}, status=status.HTTP_403_FORBIDDEN)

        # Managers cannot edit other managers' roles
        if membership.role == 'manager' and not is_owner:
            return Response({'detail': 'Only Owner can change Manager roles.'}, status=status.HTTP_403_FORBIDDEN)

        membership.role = new_role
        membership.save(update_fields=['role', 'updated_at'])
        logger.info('Role for member %s updated to %s by %s', membership.id, new_role, request.user.email)
        return Response(HotelMembershipSerializer(membership).data)


class RevokeMembershipView(APIView):
    """DELETE /api/v1/hotels/{hotel_id}/members/{membership_id}/"""
    permission_classes = [IsHotelManager]

    def delete(self, request, hotel_id, membership_id):
        try:
            membership = HotelMembership.objects.get(
                id=membership_id,
                hotel_id=hotel_id,
                is_active=True,
            )
        except HotelMembership.DoesNotExist:
            return Response({'detail': 'Membership not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Prevent revoking your own membership
        if membership.user == request.user:
            return Response(
                {'detail': 'You cannot revoke your own membership.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Owner cannot be revoked
        if membership.role == 'owner':
            return Response({'detail': 'Owner membership cannot be revoked.'}, status=status.HTTP_403_FORBIDDEN)

        # Only Owner can remove a Manager
        is_owner = HotelMembership.objects.filter(
            hotel_id=hotel_id,
            user=request.user,
            role='owner',
            is_active=True
        ).exists()

        if membership.role == 'manager' and not is_owner:
            return Response({'detail': 'Only the Hotel Owner can remove a Manager.'}, status=status.HTTP_403_FORBIDDEN)

        membership.is_active = False
        membership.save(update_fields=['is_active'])
        logger.info('Membership %s revoked by %s', membership_id, request.user.email)
        return Response(status=status.HTTP_204_NO_CONTENT)
