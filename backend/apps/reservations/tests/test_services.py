"""Check-in / check-out / cancel workflows (database-backed)."""

from datetime import date, datetime
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.guests.models import Guest
from apps.reservations import services
from apps.reservations.models import Reservation

FRI, SAT, SUN, MON = (date(2026, 11, d) for d in (6, 7, 8, 9))
Status = Reservation.Status


def at(day, hour, minute=0):
    return timezone.make_aware(datetime(day.year, day.month, day.day, hour, minute))


class ServiceTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.guest = Guest.objects.create(name='Maria Silva', document='12345678900', phone='11912345678')

    def make_reservation(self, check_in=SAT, check_out=SUN, has_car=False, **extra):
        return Reservation.objects.create(
            guest=self.guest,
            check_in_date=check_in,
            check_out_date=check_out,
            has_car=has_car,
            **extra,
        )


class CheckInTests(ServiceTestCase):
    def test_check_in_after_14h_marks_reservation_as_checked_in(self):
        reservation = self.make_reservation()
        now = at(SAT, 15, 30)

        result = services.check_in(reservation.pk, now=now)

        self.assertEqual(result.status, Status.CHECKED_IN)
        self.assertEqual(result.checked_in_at, now)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Status.CHECKED_IN)

    def test_check_in_at_exactly_14h_is_allowed_without_confirmation(self):
        reservation = self.make_reservation()
        result = services.check_in(reservation.pk, now=at(SAT, 14, 0))
        self.assertEqual(result.status, Status.CHECKED_IN)

    def test_check_in_before_14h_raises_an_alert_and_changes_nothing(self):
        reservation = self.make_reservation()

        with self.assertRaises(services.EarlyCheckInNotConfirmed) as ctx:
            services.check_in(reservation.pk, now=at(SAT, 13, 59))

        self.assertEqual(timezone.localtime(ctx.exception.allowed_from), at(SAT, 14, 0))
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Status.RESERVED)
        self.assertIsNone(reservation.checked_in_at)

    def test_early_check_in_goes_through_when_attendant_confirms(self):
        reservation = self.make_reservation()
        result = services.check_in(reservation.pk, confirm_early=True, now=at(SAT, 9, 0))
        self.assertEqual(result.status, Status.CHECKED_IN)

    def test_check_in_the_day_before_is_early_too(self):
        reservation = self.make_reservation()
        with self.assertRaises(services.EarlyCheckInNotConfirmed):
            services.check_in(reservation.pk, now=at(FRI, 22, 0))

    def test_cannot_check_in_twice(self):
        reservation = self.make_reservation()
        services.check_in(reservation.pk, now=at(SAT, 15))
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_in(reservation.pk, now=at(SAT, 16))

    def test_cannot_check_in_a_canceled_reservation(self):
        reservation = self.make_reservation(status=Status.CANCELED)
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_in(reservation.pk, now=at(SAT, 15))

    def test_cannot_check_in_a_checked_out_reservation(self):
        reservation = self.make_reservation(status=Status.CHECKED_OUT)
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_in(reservation.pk, now=at(SAT, 15))


class CheckOutTests(ServiceTestCase):
    def checked_in(self, **kwargs):
        reservation = self.make_reservation(**kwargs)
        services.check_in(reservation.pk, now=at(reservation.check_in_date, 15))
        return reservation

    def test_check_out_on_time_has_no_late_fee_and_stores_the_total(self):
        reservation = self.checked_in(check_in=FRI, check_out=SAT)

        result, bill = services.check_out(reservation.pk, now=at(SAT, 11, 0))

        self.assertEqual(result.status, Status.CHECKED_OUT)
        self.assertEqual(result.checked_out_at, at(SAT, 11, 0))
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.total, Decimal('120.00'))
        reservation.refresh_from_db()
        self.assertEqual(reservation.total_amount, Decimal('120.00'))

    def test_late_check_out_adds_50_percent_of_the_departure_day_rate(self):
        reservation = self.checked_in(check_in=FRI, check_out=SAT)  # leaves Saturday: 180
        _, bill = services.check_out(reservation.pk, now=at(SAT, 12, 30))
        self.assertTrue(bill.late_checkout)
        self.assertEqual(bill.late_checkout_fee, Decimal('90.00'))
        self.assertEqual(bill.total, Decimal('210.00'))

    def test_stored_total_matches_the_bill_with_parking_and_late_fee(self):
        reservation = self.checked_in(check_in=FRI, check_out=MON, has_car=True)
        result, bill = services.check_out(reservation.pk, now=at(MON, 13, 0))
        # nights Fri/Sat/Sun: 480 + parking 55 + late (Mon, weekday) 60
        self.assertEqual(bill.total, Decimal('595.00'))
        self.assertEqual(result.total_amount, Decimal('595.00'))

    def test_same_day_departure_before_the_booked_day_is_not_late(self):
        """Regression: arrived Sat, left Sat 23:28, booked until Sun."""
        reservation = self.checked_in(check_in=SAT, check_out=SUN, has_car=True)
        _, bill = services.check_out(reservation.pk, now=at(SAT, 23, 28))
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.total, Decimal('200.00'))

    def test_cannot_check_out_without_check_in(self):
        reservation = self.make_reservation()
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_out(reservation.pk, now=at(SUN, 10))

    def test_cannot_check_out_twice(self):
        reservation = self.checked_in()
        services.check_out(reservation.pk, now=at(SUN, 10))
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_out(reservation.pk, now=at(SUN, 11))

    def test_cannot_check_out_a_canceled_reservation(self):
        reservation = self.make_reservation(status=Status.CANCELED)
        with self.assertRaises(services.InvalidStatusTransition):
            services.check_out(reservation.pk, now=at(SUN, 10))


class BillForTests(ServiceTestCase):
    def test_reserved_reservation_gets_a_punctual_stay_estimate(self):
        reservation = self.make_reservation(check_in=SAT, check_out=SUN, has_car=True)
        bill = services.bill_for(reservation, now=at(SAT, 10))
        self.assertEqual(bill.total, Decimal('200.00'))
        self.assertFalse(bill.late_checkout)

    def test_checked_in_reservation_previews_the_bill_as_if_leaving_now(self):
        reservation = self.make_reservation(check_in=FRI, check_out=SAT)
        services.check_in(reservation.pk, now=at(FRI, 15))
        reservation.refresh_from_db()

        on_time = services.bill_for(reservation, now=at(SAT, 11))
        late = services.bill_for(reservation, now=at(SAT, 13))

        self.assertEqual(on_time.total, Decimal('120.00'))
        self.assertEqual(late.total, Decimal('210.00'))

    def test_checked_out_reservation_always_shows_the_frozen_bill(self):
        reservation = self.make_reservation(check_in=FRI, check_out=SAT)
        services.check_in(reservation.pk, now=at(FRI, 15))
        services.check_out(reservation.pk, now=at(SAT, 11))
        reservation.refresh_from_db()

        # "now" is much later, but the bill is computed from the real checkout time
        bill = services.bill_for(reservation, now=at(MON, 20))

        self.assertEqual(bill.total, Decimal('120.00'))
        self.assertEqual(bill.total, reservation.total_amount)


class CancelTests(ServiceTestCase):
    def test_cancel_a_reserved_reservation(self):
        reservation = self.make_reservation()
        result = services.cancel(reservation.pk)
        self.assertEqual(result.status, Status.CANCELED)

    def test_cannot_cancel_after_check_in(self):
        reservation = self.make_reservation()
        services.check_in(reservation.pk, now=at(SAT, 15))
        with self.assertRaises(services.InvalidStatusTransition):
            services.cancel(reservation.pk)

    def test_cannot_cancel_twice(self):
        reservation = self.make_reservation()
        services.cancel(reservation.pk)
        with self.assertRaises(services.InvalidStatusTransition):
            services.cancel(reservation.pk)


class ReservationModelTests(ServiceTestCase):
    def test_new_reservation_starts_as_reserved_without_times_or_total(self):
        reservation = self.make_reservation()
        self.assertEqual(reservation.status, Status.RESERVED)
        self.assertIsNone(reservation.checked_in_at)
        self.assertIsNone(reservation.checked_out_at)
        self.assertIsNone(reservation.total_amount)
        self.assertFalse(reservation.has_car)

    def test_database_rejects_checkout_on_or_before_checkin(self):
        for check_out in (SAT, FRI):
            with self.subTest(check_out=check_out):
                with self.assertRaises(IntegrityError), transaction.atomic():
                    self.make_reservation(check_in=SAT, check_out=check_out)

    def test_guest_with_reservations_cannot_be_deleted(self):
        from django.db.models import ProtectedError

        self.make_reservation()
        with self.assertRaises(ProtectedError):
            self.guest.delete()
