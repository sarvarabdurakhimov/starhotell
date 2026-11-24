"""Regression tests for the security review: account takeover through staff invites,
login brute force, HTML in manager notifications, and cross-hotel references."""
import pytest
from django.core.cache import cache

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.memberships.models import HotelMembership, HotelRole

STRONG = 'Kuchli-parol-2026'


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestNoAccountTakeoverViaInvite:
    def test_attacker_cannot_attach_and_reset_someone_elses_account(self, hotel_factory, user_factory):
        victim = user_factory(email='victim@example.com', password=STRONG)  # has no hotel of their own
        evil_hotel, attacker = hotel_factory(name='Evil Hotel')
        attacker_client = client_for(attacker)

        invite = attacker_client.post(reverse('memberships:invite', kwargs={'hotel_id': evil_hotel.id}),
                                      {'email': victim.email, 'role': 'receptionist'})
        assert invite.status_code == status.HTTP_409_CONFLICT
        assert not HotelMembership.objects.filter(user=victim).exists()

        # Even if a membership exists (e.g. made before this fix), the hotel did not create
        # this login, so it cannot give it a new password.
        m = HotelMembership.objects.create(hotel=evil_hotel, user=victim, role=HotelRole.RECEPTIONIST,
                                           invited_by=attacker)
        reset = attacker_client.post(
            reverse('memberships:set_password', kwargs={'hotel_id': evil_hotel.id, 'membership_id': m.id}),
            {'password': 'Hacked-parol-2026'})
        assert reset.status_code == status.HTTP_403_FORBIDDEN
        victim.refresh_from_db()
        assert victim.check_password(STRONG)

    def test_hotel_can_reset_the_login_it_created(self, hotel_factory):
        hotel, owner = hotel_factory(name='Good Hotel')
        c = client_for(owner)
        invite = c.post(reverse('memberships:invite', kwargs={'hotel_id': hotel.id}), {
            'email': 'staff@example.com', 'role': 'receptionist', 'first_name': 'Ali', 'password': STRONG})
        assert invite.status_code == status.HTTP_201_CREATED, invite.data
        url = reverse('memberships:set_password', kwargs={'hotel_id': hotel.id, 'membership_id': invite.data['id']})
        reset = c.post(url, {'password': 'Yangi-parol-2026'})
        assert reset.status_code == status.HTTP_200_OK, reset.data

    def test_former_staff_rehired_and_staff_shared_between_own_hotels(self, hotel_factory, user_factory):
        hotel_a, owner = hotel_factory(name='Hotel A')
        hotel_b, _ = hotel_factory(name='Hotel B', owner=owner)
        worker = user_factory(email='worker@example.com')
        HotelMembership.objects.create(hotel=hotel_a, user=worker, role=HotelRole.RECEPTIONIST)
        c = client_for(owner)
        # Works at hotel A (same owner) -> may be added to hotel B
        res = c.post(reverse('memberships:invite', kwargs={'hotel_id': hotel_b.id}),
                     {'email': worker.email, 'role': 'receptionist'})
        assert res.status_code == status.HTTP_201_CREATED, res.data
        # Former staff of hotel B -> may be re-hired
        HotelMembership.objects.filter(hotel=hotel_b, user=worker).update(is_active=False)
        res = c.post(reverse('memberships:invite', kwargs={'hotel_id': hotel_b.id}),
                     {'email': worker.email, 'role': 'receptionist'})
        assert res.status_code == status.HTTP_201_CREATED, res.data

    def test_unknown_role_is_rejected(self, hotel_factory, user_factory):
        hotel, owner = hotel_factory(name='Role Hotel')
        m = HotelMembership.objects.create(hotel=hotel, user=user_factory(email='r@example.com'),
                                           role=HotelRole.RECEPTIONIST)
        res = client_for(owner).patch(
            reverse('memberships:update_role', kwargs={'hotel_id': hotel.id, 'membership_id': m.id}),
            {'role': 'superadmin'})
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        m.refresh_from_db()
        assert m.role == HotelRole.RECEPTIONIST


@pytest.mark.django_db
class TestLoginLockout:
    @pytest.fixture(autouse=True)
    def _limits(self, settings):
        settings.LOGIN_MAX_FAILURES = 3
        cache.clear()
        yield
        cache.clear()

    def test_wrong_passwords_lock_the_account_whatever_the_ip(self, user_factory):
        user_factory(email='target@example.com', password=STRONG)
        url = reverse('users:login')
        c = APIClient()
        for i in range(3):
            res = c.post(url, {'email': 'Target@example.com', 'password': f'guess-{i}'},
                         HTTP_X_FORWARDED_FOR=f'10.0.0.{i}')
            assert res.status_code == status.HTTP_401_UNAUTHORIZED
        # Locked now, even with the right password and yet another "IP"
        res = c.post(url, {'email': 'target@example.com', 'password': STRONG}, HTTP_X_FORWARDED_FOR='10.9.9.9')
        assert res.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_success_clears_the_counter(self, user_factory):
        user_factory(email='ok@example.com', password=STRONG)
        url = reverse('users:login')
        c = APIClient()
        for _ in range(2):
            c.post(url, {'email': 'ok@example.com', 'password': 'wrong'})
        assert c.post(url, {'email': 'ok@example.com', 'password': STRONG}).status_code == 200
        for _ in range(2):
            c.post(url, {'email': 'ok@example.com', 'password': 'wrong'})
        assert c.post(url, {'email': 'ok@example.com', 'password': STRONG}).status_code == 200


@pytest.mark.django_db
class TestCrossHotelReferences:
    def test_housekeeping_task_cannot_go_to_another_hotels_worker(self, hotel_factory, room_setup, user_factory):
        hotel, owner = hotel_factory(name='HK Hotel')
        _, outsider = hotel_factory(name='Other Hotel')
        _, room = room_setup(hotel)
        url = reverse('housekeeping:task_list', kwargs={'hotel_id': hotel.id})
        c = client_for(owner)
        assert c.post(url, {'room': room.id, 'assigned_to': outsider.id}).status_code == 400
        assert c.post(url, {'room': room.id, 'assigned_to': owner.id}).status_code == 201

    def test_hotel_cannot_join_someone_elses_organization(self, user_factory):
        from apps.organizations.models import Organization
        org = Organization.objects.create(name='Big Group', slug='big-group',
                                          owner=user_factory(email='boss@example.com'))
        c = client_for(user_factory(email='newbie@example.com'))
        res = c.post(reverse('hotels:create'), {'name': 'Sneaky Hotel', 'organization': org.id})
        assert res.status_code == 400
        assert 'organization' in res.data


@pytest.mark.django_db
def test_manager_notification_escapes_guest_name(hotel_factory, room_setup, monkeypatch):
    from datetime import date, timedelta
    from apps.telegram_bot import services as svc
    from apps.telegram_bot.models import BotConfig, TelegramChat

    hotel, _ = hotel_factory(name='Esc Hotel')
    room_type, _ = room_setup(hotel)
    bot = BotConfig.objects.create(hotel=hotel, token='1:x', bot_username='esc_bot')
    chat = TelegramChat.objects.create(bot=bot, chat_id=5, first_name='<a href="http://x">Ali</a> & Co',
                                       phone='+998901112233')
    sent = []
    monkeypatch.setattr(svc, 'notify_managers', lambda b, text: sent.append(text))
    monkeypatch.setattr(svc, 'send', lambda *a, **kw: None)
    ci = date.today() + timedelta(days=3)
    assert svc.create_request(chat, room_type.id, ci, ci + timedelta(days=1), 1)
    assert '<a href' not in sent[0] and '&lt;a href=' in sent[0] and '&amp; Co' in sent[0]
