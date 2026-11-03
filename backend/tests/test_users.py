import pytest
from django.urls import reverse
from rest_framework import status
from apps.users.models import User


@pytest.mark.django_db
class TestUserAuthentication:
    def test_register_user_success(self, api_client):
        url = reverse('users:register')
        data = {
            'email': 'newuser@example.com',
            'first_name': 'Jane',
            'last_name': 'Doe',
            'password': 'StrongPassword123!',
            'password_confirm': 'StrongPassword123!',
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(email='newuser@example.com').exists()

    def test_login_sets_cookie_and_tokens(self, api_client, user_factory):
        user = user_factory(email='login@example.com', password='password123')
        url = reverse('users:login')
        response = api_client.post(url, {'email': 'login@example.com', 'password': 'password123'})
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'hms_access' in response.cookies

    def test_login_invalid_password_fails(self, api_client, user_factory):
        user_factory(email='fail@example.com', password='correct_password')
        url = reverse('users:login')
        response = api_client.post(url, {'email': 'fail@example.com', 'password': 'wrong_password'})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
