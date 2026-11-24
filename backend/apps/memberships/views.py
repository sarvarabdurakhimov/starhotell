"""Membership management API views."""
import logging

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsHotelManager, IsHotelMember
from apps.users.models import User
from .models import HotelMembership, HotelRole
from .serializers import HotelMembershipSerializer, InviteMemberSerializer

logger = logging.getLogger(__name__)

# Django's password validator messages, in the panel's language
PASSWORD_ERRORS_UZ = {
    'password_too_short': "Parol kamida 8 ta belgidan iborat bo'lishi kerak.",
    'password_too_common': "Bu parol juda oddiy, boshqasini tanlang.",
    'password_entirely_numeric': "Parol faqat raqamlardan iborat bo'lmasligi kerak.",
    'password_too_similar': "Parol email yoki ismga juda o'xshash.",
}


def _password_errors(password, user):
    """Uzbek error list for a staff password, or [] when it is acceptable."""
    if not password:
        return ['Parol kiritilishi shart.']
    if password != password.strip():
        return ["Parol boshida yoki oxirida bo'sh joy bo'lmasin."]
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return [PASSWORD_ERRORS_UZ.get(e.code, m) for e, m in zip(exc.error_list, exc.messages)]
    return []


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
                {
                    'detail': 'Ownership cannot be assigned via invitation. '
                    'Ownership transfer requires explicit superuser/board action.'
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if role == 'manager' and not is_owner:
            return Response(
                {'detail': 'Only the Hotel Owner can appoint or invite a Manager.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Existing account: just attach it (its password is never changed from here).
        # New email: create the account with the name and password the owner typed.
        user = User.objects.filter(email__iexact=email).first()
        account_created = False
        if user is not None and not self._may_attach(request.user, user, hotel_id):
            # Attaching someone else's account without their consent would let this hotel
            # act on it (and, before, reset its password). Only accounts this hotel already
            # had, or staff of another hotel the same owner runs, can be added by email.
            return Response(
                {'email': ["Bu email bilan akkaunt allaqachon bor. Xodim uchun boshqa email kiriting."]},
                status=status.HTTP_409_CONFLICT,
            )
        if user is None:
            data = serializer.validated_data
            password = data.get('password') or ''
            first_name = (data.get('first_name') or '').strip()
            errors = {}
            if not first_name:
                errors['first_name'] = ['Ism kiritilishi shart.']
            if not password:
                errors['password'] = ['Yangi xodim uchun parol kiritilishi shart.']
            elif password != password.strip():
                errors['password'] = ["Parol boshida yoki oxirida bo'sh joy bo'lmasin."]
            else:
                try:
                    validate_password(password, user=User(email=email, first_name=first_name))
                except DjangoValidationError as exc:
                    errors['password'] = [
                        PASSWORD_ERRORS_UZ.get(e.code, m) for e, m in zip(exc.error_list, exc.messages)
                    ]
            if errors:
                return Response(errors, status=status.HTTP_400_BAD_REQUEST)
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=(data.get('last_name') or '').strip(),
                    is_email_verified=True,
                )
            account_created = True

        membership, created = HotelMembership.objects.get_or_create(
            hotel_id=hotel_id,
            user=user,
            defaults={'role': role, 'invited_by': request.user, 'is_active': True,
                      'account_created': account_created},
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

        logger.info('User %s invited %s to hotel %s with role %s (new account: %s)',
                    request.user.email, email, hotel_id, role, account_created)
        return Response(
            {**HotelMembershipSerializer(membership).data, 'account_created': account_created},
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _may_attach(inviter, user, hotel_id) -> bool:
        """An existing account may be added only if it already belonged to this hotel
        (re-hiring former staff) or it works at another hotel this inviter owns."""
        if HotelMembership.objects.filter(hotel_id=hotel_id, user=user).exists():
            return True
        owned = HotelMembership.objects.filter(user=inviter, role='owner', is_active=True).values('hotel_id')
        return HotelMembership.objects.filter(user=user, is_active=True, hotel_id__in=owned).exists()


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
        if new_role not in HotelRole.values:
            return Response({'role': ["Noto'g'ri rol."]}, status=status.HTTP_400_BAD_REQUEST)

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


class SetMemberPasswordView(APIView):
    """
    POST /api/v1/memberships/hotels/{hotel_id}/members/{membership_id}/password/
    The owner (or a manager, for non-manager staff) sets a new login password for a staff member,
    e.g. when they forgot it. Only for accounts that belong to this hotel alone.
    """
    permission_classes = [IsHotelManager]

    def post(self, request, hotel_id, membership_id):
        try:
            membership = HotelMembership.objects.select_related('user').get(
                id=membership_id, hotel_id=hotel_id, is_active=True
            )
        except HotelMembership.DoesNotExist:
            return Response({'detail': 'Xodim topilmadi.'}, status=status.HTTP_404_NOT_FOUND)

        user = membership.user
        is_owner = HotelMembership.objects.filter(
            hotel_id=hotel_id, user=request.user, role='owner', is_active=True
        ).exists()

        if user == request.user:
            return Response(
                {'detail': "O'z parolingizni profil orqali o'zgartiring."}, status=status.HTTP_400_BAD_REQUEST
            )
        if membership.role == 'owner' or user.is_superuser or user.is_staff:
            return Response(
                {'detail': "Bu akkauntning parolini o'zgartirib bo'lmaydi."}, status=status.HTTP_403_FORBIDDEN
            )
        if membership.role == 'manager' and not is_owner:
            return Response(
                {'detail': "Menejer parolini faqat boshliq o'zgartira oladi."}, status=status.HTTP_403_FORBIDDEN
            )
        # Only a login this hotel created itself may be reset here; an account the person made
        # (or another hotel made) belongs to them.
        if not membership.account_created:
            return Response(
                {'detail': "Bu akkauntni xodimning o'zi ochgan, parolini faqat o'zi o'zgartira oladi."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # An account that also works at another hotel is not ours to reset.
        if HotelMembership.objects.filter(user=user, is_active=True).exclude(hotel_id=hotel_id).exists():
            return Response(
                {'detail': "Bu xodim boshqa mehmonxonada ham ishlaydi, parolini faqat o'zi o'zgartira oladi."},
                status=status.HTTP_403_FORBIDDEN,
            )

        password = request.data.get('password') or ''
        errors = _password_errors(password, user)
        if errors:
            return Response({'password': errors}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.save(update_fields=['password'])
        logger.info('Password for %s reset by %s (hotel %s)', user.email, request.user.email, hotel_id)
        return Response({'detail': "Parol o'zgartirildi."})
