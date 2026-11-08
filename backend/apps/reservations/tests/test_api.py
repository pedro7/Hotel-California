"""Reservation REST API: validation, listing/filters, check-in, check-out, cancel."""

from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest import mock

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.guests.models import Guest
from apps.reservations.models import Reservation

FRI, SAT, SUN, MON = (date(2026, 11, d) for d in (6, 7, 8, 9))
Status = Reservation.Status


def aware(day, hour, minute=0):
    return timezone.make_aware(datetime(day.year, day.month, day.day, hour, minute))


@contextmanager
def at(day, hour, minute=0):
    """Freeze "now" (affects timezone.now / localdate used by the app)."""
    with mock.patch('django.utils.timezone.now', return_value=aware(day, hour, minute)):
        yield


class ReservationAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user('atendente', password='senha-forte-123')
        cls.maria = Guest.objects.create(name='Maria Silva', document='12345678900', phone='11912345678')
        cls.joao = Guest.objects.create(name='João Souza', document='98765432100', phone='21988887777')

    def setUp(self):
        self.client.force_authenticate(self.user)

    def make(self, guest=None, check_in=SAT, check_out=SUN, has_car=False, **extra):
        return Reservation.objects.create(
            guest=guest or self.maria,
            check_in_date=check_in,
            check_out_date=check_out,
            has_car=has_car,
            **extra,
        )

    def url(self, reservation, action=''):
        return f'/api/reservations/{reservation.pk}/{action}'


class AccessTests(ReservationAPITestCase):
    def test_login_is_required(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/reservations/').status_code, 403)
        self.assertEqual(self.client.post('/api/reservations/', {}).status_code, 403)

    def test_reservations_cannot_be_deleted(self):
        reservation = self.make()
        self.assertEqual(self.client.delete(self.url(reservation)).status_code, 405)
        self.assertTrue(Reservation.objects.filter(pk=reservation.pk).exists())


class CreateReservationTests(ReservationAPITestCase):
    def payload(self, **overrides):
        data = {
            'guest': self.maria.pk,
            'check_in_date': '2026-11-07',
            'check_out_date': '2026-11-09',
            'has_car': True,
        }
        data.update(overrides)
        return data

    def test_creates_a_reserved_reservation(self):
        with at(SAT, 10):
            response = self.client.post('/api/reservations/', self.payload(), format='json')

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['status'], 'RESERVED')
        self.assertTrue(body['has_car'])
        self.assertEqual(body['guest_detail']['name'], 'Maria Silva')
        self.assertIsNone(body['checked_in_at'])
        self.assertIsNone(body['total_amount'])
        self.assertEqual(Reservation.objects.count(), 1)

    def test_has_car_defaults_to_false(self):
        data = self.payload()
        del data['has_car']
        with at(SAT, 10):
            response = self.client.post('/api/reservations/', data, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()['has_car'])

    def test_client_cannot_set_status_or_total(self):
        with at(SAT, 10):
            response = self.client.post(
                '/api/reservations/',
                self.payload(status='CHECKED_OUT', total_amount='1.00'),
                format='json',
            )
        self.assertEqual(response.status_code, 201)
        reservation = Reservation.objects.get()
        self.assertEqual(reservation.status, Status.RESERVED)
        self.assertIsNone(reservation.total_amount)

    def test_checkout_must_be_after_checkin(self):
        for check_out in ('2026-11-07', '2026-11-06'):
            with self.subTest(check_out=check_out):
                with at(SAT, 10):
                    response = self.client.post(
                        '/api/reservations/', self.payload(check_out_date=check_out), format='json'
                    )
                self.assertEqual(response.status_code, 400)
                self.assertIn('check_out_date', response.json())

    def test_checkin_date_cannot_be_in_the_past(self):
        with at(SAT, 10):
            response = self.client.post(
                '/api/reservations/', self.payload(check_in_date='2026-11-06'), format='json'
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn('check_in_date', response.json())

    def test_checkin_today_is_allowed(self):
        with at(SAT, 23, 0):
            response = self.client.post('/api/reservations/', self.payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_unknown_guest_is_rejected(self):
        with at(SAT, 10):
            response = self.client.post('/api/reservations/', self.payload(guest=99999), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('guest', response.json())

    def test_guest_is_required(self):
        data = self.payload()
        del data['guest']
        with at(SAT, 10):
            response = self.client.post('/api/reservations/', data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('guest', response.json())


class UpdateReservationTests(ReservationAPITestCase):
    def test_reserved_reservation_can_be_edited(self):
        reservation = self.make()
        with at(SAT, 10):
            response = self.client.patch(self.url(reservation), {'has_car': True}, format='json')
        self.assertEqual(response.status_code, 200)
        reservation.refresh_from_db()
        self.assertTrue(reservation.has_car)

    def test_dates_are_revalidated_on_edit(self):
        reservation = self.make(check_in=SAT, check_out=MON)
        with at(SAT, 10):
            response = self.client.patch(
                self.url(reservation), {'check_out_date': '2026-11-07'}, format='json'
            )
        self.assertEqual(response.status_code, 400)

    def test_only_reserved_reservations_can_be_edited(self):
        for status in (Status.CHECKED_IN, Status.CHECKED_OUT, Status.CANCELED):
            with self.subTest(status=status):
                reservation = self.make(status=status)
                response = self.client.patch(self.url(reservation), {'has_car': True}, format='json')
                self.assertEqual(response.status_code, 400)
                reservation.refresh_from_db()
                self.assertFalse(reservation.has_car)


class ListReservationsTests(ReservationAPITestCase):
    def setUp(self):
        super().setUp()
        self.reserved = self.make(self.maria, status=Status.RESERVED)
        self.in_hotel = self.make(self.joao, status=Status.CHECKED_IN)
        self.finished = self.make(self.maria, status=Status.CHECKED_OUT)
        self.canceled = self.make(self.joao, status=Status.CANCELED)

    def ids(self, query=''):
        response = self.client.get(f'/api/reservations/{query}')
        self.assertEqual(response.status_code, 200)
        return {item['id'] for item in response.json()['results']}

    def test_lists_everything_by_default(self):
        self.assertEqual(len(self.ids()), 4)

    def test_filter_awaiting_check_in(self):
        self.assertEqual(self.ids('?status=RESERVED'), {self.reserved.id})

    def test_filter_guests_still_in_the_hotel(self):
        self.assertEqual(self.ids('?status=CHECKED_IN'), {self.in_hotel.id})

    def test_filter_by_several_statuses(self):
        self.assertEqual(
            self.ids('?status=CHECKED_OUT,CANCELED'), {self.finished.id, self.canceled.id}
        )

    def test_status_filter_is_case_insensitive(self):
        self.assertEqual(self.ids('?status=reserved'), {self.reserved.id})

    def test_filter_by_guest_id(self):
        self.assertEqual(
            self.ids(f'?guest={self.maria.pk}'), {self.reserved.id, self.finished.id}
        )

    def test_search_by_guest_name(self):
        self.assertEqual(self.ids('?search=joão'), {self.in_hotel.id, self.canceled.id})

    def test_search_by_guest_document(self):
        self.assertEqual(
            self.ids('?document=123.456.789'), {self.reserved.id, self.finished.id}
        )

    def test_search_by_guest_phone(self):
        self.assertEqual(self.ids('?phone=(21) 98888'), {self.in_hotel.id, self.canceled.id})

    def test_status_and_search_combine(self):
        self.assertEqual(self.ids('?status=CHECKED_IN&search=joão'), {self.in_hotel.id})
        self.assertEqual(self.ids('?status=CHECKED_IN&search=maria'), set())

    def test_response_is_paginated(self):
        body = self.client.get('/api/reservations/').json()
        self.assertEqual(body['count'], 4)
        self.assertIn('results', body)


class CheckInAPITests(ReservationAPITestCase):
    def test_check_in_after_14h(self):
        reservation = self.make()
        with at(SAT, 15, 0):
            response = self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'CHECKED_IN')
        self.assertIsNotNone(response.json()['checked_in_at'])

    def test_check_in_before_14h_returns_the_alert(self):
        reservation = self.make()
        with at(SAT, 9, 0):
            response = self.client.post(self.url(reservation, 'check-in/'), {}, format='json')

        self.assertEqual(response.status_code, 409)
        body = response.json()
        self.assertEqual(body['code'], 'early_check_in')
        self.assertIn('14h00', body['detail'])
        self.assertTrue(body['allowed_from'].startswith('2026-11-07T14:00:00'))
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Status.RESERVED)

    def test_early_check_in_succeeds_once_confirmed(self):
        reservation = self.make()
        with at(SAT, 9, 0):
            response = self.client.post(
                self.url(reservation, 'check-in/'), {'confirm_early': True}, format='json'
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'CHECKED_IN')

    def test_second_check_in_is_rejected(self):
        reservation = self.make()
        with at(SAT, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
            response = self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'invalid_status')

    def test_unknown_reservation_is_404(self):
        response = self.client.post('/api/reservations/999999/check-in/', {}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_check_in_requires_login(self):
        reservation = self.make()
        self.client.force_authenticate(None)
        response = self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        self.assertEqual(response.status_code, 403)


class CheckOutAPITests(ReservationAPITestCase):
    def checked_in(self, **kwargs):
        reservation = self.make(**kwargs)
        with at(reservation.check_in_date, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        return reservation

    def test_check_out_returns_the_detailed_bill(self):
        reservation = self.checked_in(check_in=FRI, check_out=MON, has_car=True)

        with at(MON, 11, 0):
            response = self.client.post(self.url(reservation, 'check-out/'), format='json')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['reservation']['status'], 'CHECKED_OUT')
        bill = body['bill']
        self.assertEqual(bill['nights_count'], 3)
        self.assertEqual([n['date'] for n in bill['nights']], ['2026-11-06', '2026-11-07', '2026-11-08'])
        self.assertEqual([n['daily_rate'] for n in bill['nights']], ['120.00', '180.00', '180.00'])
        self.assertEqual([n['parking_fee'] for n in bill['nights']], ['15.00', '20.00', '20.00'])
        self.assertEqual(bill['daily_total'], '480.00')
        self.assertEqual(bill['parking_total'], '55.00')
        self.assertFalse(bill['late_checkout'])
        self.assertEqual(bill['late_checkout_fee'], '0.00')
        self.assertEqual(bill['total'], '535.00')

    def test_total_is_persisted_on_the_reservation(self):
        reservation = self.checked_in(check_in=FRI, check_out=SAT)
        with at(SAT, 10, 0):
            self.client.post(self.url(reservation, 'check-out/'), format='json')
        reservation.refresh_from_db()
        self.assertEqual(reservation.total_amount, Decimal('120.00'))
        self.assertIsNotNone(reservation.checked_out_at)

    def test_late_check_out_is_charged_in_the_response(self):
        reservation = self.checked_in(check_in=FRI, check_out=SAT)
        with at(SAT, 12, 30):
            response = self.client.post(self.url(reservation, 'check-out/'), format='json')
        bill = response.json()['bill']
        self.assertTrue(bill['late_checkout'])
        self.assertEqual(bill['late_checkout_fee'], '90.00')  # 50% of the Saturday rate
        self.assertEqual(bill['total'], '210.00')

    def test_leaving_the_night_of_arrival_is_not_charged_as_late(self):
        reservation = self.checked_in(check_in=SAT, check_out=SUN, has_car=True)
        with at(SAT, 23, 28):
            response = self.client.post(self.url(reservation, 'check-out/'), format='json')
        bill = response.json()['bill']
        self.assertFalse(bill['late_checkout'])
        self.assertEqual(bill['total'], '200.00')

    def test_cannot_check_out_without_check_in(self):
        reservation = self.make()
        response = self.client.post(self.url(reservation, 'check-out/'), format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'invalid_status')

    def test_cannot_check_out_twice(self):
        reservation = self.checked_in(check_in=FRI, check_out=SAT)
        with at(SAT, 10, 0):
            self.client.post(self.url(reservation, 'check-out/'), format='json')
            response = self.client.post(self.url(reservation, 'check-out/'), format='json')
        self.assertEqual(response.status_code, 409)


class BillAPITests(ReservationAPITestCase):
    def test_preview_for_a_guest_in_the_hotel_reflects_the_current_time(self):
        reservation = self.make(check_in=FRI, check_out=SAT)
        with at(FRI, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')

        with at(SAT, 11, 0):
            on_time = self.client.get(self.url(reservation, 'bill/')).json()
        with at(SAT, 13, 0):
            late = self.client.get(self.url(reservation, 'bill/')).json()

        self.assertEqual(on_time['total'], '120.00')
        self.assertEqual(late['total'], '210.00')
        self.assertTrue(late['late_checkout'])

    def test_preview_does_not_change_the_reservation(self):
        reservation = self.make(check_in=FRI, check_out=SAT)
        with at(FRI, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        with at(SAT, 13, 0):
            self.client.get(self.url(reservation, 'bill/'))
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Status.CHECKED_IN)
        self.assertIsNone(reservation.total_amount)

    def test_finished_reservation_shows_the_final_bill(self):
        reservation = self.make(check_in=FRI, check_out=SAT)
        with at(FRI, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        with at(SAT, 10, 0):
            self.client.post(self.url(reservation, 'check-out/'), format='json')

        with at(MON, 20, 0):  # looked at much later
            body = self.client.get(self.url(reservation, 'bill/')).json()

        self.assertEqual(body['total'], '120.00')
        self.assertFalse(body['late_checkout'])

    def test_bill_of_a_future_reservation_is_an_estimate(self):
        reservation = self.make(check_in=SAT, check_out=MON, has_car=True)
        body = self.client.get(self.url(reservation, 'bill/')).json()
        self.assertEqual(body['nights_count'], 2)
        self.assertEqual(body['total'], '400.00')  # (180+20) * 2


class CancelAPITests(ReservationAPITestCase):
    def test_cancel_a_reserved_reservation(self):
        reservation = self.make()
        response = self.client.post(self.url(reservation, 'cancel/'), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'CANCELED')

    def test_canceled_reservation_is_no_longer_awaiting_check_in(self):
        reservation = self.make()
        self.client.post(self.url(reservation, 'cancel/'), format='json')
        ids = {r['id'] for r in self.client.get('/api/reservations/?status=RESERVED').json()['results']}
        self.assertNotIn(reservation.id, ids)

    def test_cannot_cancel_after_check_in(self):
        reservation = self.make()
        with at(SAT, 15, 0):
            self.client.post(self.url(reservation, 'check-in/'), {}, format='json')
        response = self.client.post(self.url(reservation, 'cancel/'), format='json')
        self.assertEqual(response.status_code, 409)
