"""Attendant login: session + CSRF."""

from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import User

PASSWORD = 'senha-forte-123'


class AuthTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            'atendente', password=PASSWORD, first_name='Ana', last_name='Souza'
        )

    def setUp(self):
        cache.clear()  # the login throttle lives in the cache
        # Real browsers must send the CSRF token: enforce it like production does.
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self):
        self.client.get('/api/auth/csrf/')
        return self.client.cookies['csrftoken'].value

    def post(self, path, data=None):
        return self.client.post(
            path, data or {}, format='json', HTTP_X_CSRFTOKEN=self.client.cookies['csrftoken'].value
        )

    def login(self, password=PASSWORD):
        self.csrf()
        return self.post('/api/auth/login/', {'username': 'atendente', 'password': password})

    def test_csrf_endpoint_sets_the_cookie(self):
        response = self.client.get('/api/auth/csrf/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('csrftoken', response.cookies)

    def test_login_with_valid_credentials(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['username'], 'atendente')
        self.assertEqual(body['first_name'], 'Ana')
        self.assertNotIn('password', body)
        self.assertIn('sessionid', self.client.cookies)

    def test_login_with_wrong_password_is_rejected(self):
        response = self.login('senha-errada')
        self.assertEqual(response.status_code, 401)
        self.assertNotIn('sessionid', self.client.cookies)

    def test_login_with_unknown_user_is_rejected(self):
        self.csrf()
        response = self.post('/api/auth/login/', {'username': 'ninguem', 'password': PASSWORD})
        self.assertEqual(response.status_code, 401)

    def test_inactive_user_cannot_log_in(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.login().status_code, 401)

    def test_login_requires_username_and_password(self):
        self.csrf()
        response = self.post('/api/auth/login/', {'username': 'atendente'})
        self.assertEqual(response.status_code, 400)

    def test_login_without_csrf_token_is_forbidden(self):
        self.client.get('/api/auth/csrf/')  # cookie present, header missing
        response = self.client.post(
            '/api/auth/login/', {'username': 'atendente', 'password': PASSWORD}, format='json'
        )
        self.assertEqual(response.status_code, 403)

    def test_login_is_throttled_after_too_many_attempts(self):
        self.csrf()
        statuses = [
            self.post('/api/auth/login/', {'username': 'atendente', 'password': 'x'}).status_code
            for _ in range(11)
        ]
        self.assertEqual(statuses[:10], [401] * 10)
        self.assertEqual(statuses[10], 429)

    def test_me_returns_the_logged_user(self):
        self.login()
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['username'], 'atendente')

    def test_me_requires_login(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 403)

    def test_protected_api_requires_login(self):
        self.assertEqual(self.client.get('/api/guests/').status_code, 403)
        self.assertEqual(self.client.get('/api/reservations/').status_code, 403)

    def test_after_login_the_api_is_accessible(self):
        self.login()
        self.assertEqual(self.client.get('/api/guests/').status_code, 200)

    def test_logout_ends_the_session(self):
        self.login()
        response = self.post('/api/auth/logout/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 403)
        self.assertEqual(self.client.get('/api/guests/').status_code, 403)

    def test_logout_requires_login(self):
        self.csrf()
        self.assertEqual(self.post('/api/auth/logout/').status_code, 403)

    def test_unsafe_requests_need_the_csrf_header_once_logged_in(self):
        self.login()
        response = self.client.post(
            '/api/guests/',
            {'name': 'X Y', 'document': '12345678900', 'phone': '11912345678'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
