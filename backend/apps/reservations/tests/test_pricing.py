"""Business rules of pricing: daily rates, parking, check-in/check-out times.

Calendar used below (2026): Mon 02/11 ... Fri 06/11, Sat 07/11, Sun 08/11,
Mon 09/11, Tue 10/11.
"""

from datetime import date, datetime
from decimal import Decimal

from django.test import SimpleTestCase
from django.utils import timezone

from apps.reservations import pricing
from apps.reservations.pricing import calculate_bill

MON, TUE, WED, THU, FRI, SAT, SUN = (date(2026, 11, d) for d in (2, 3, 4, 5, 6, 7, 8))
NEXT_MON, NEXT_TUE = date(2026, 11, 9), date(2026, 11, 10)


def at(day, hour, minute=0, second=0):
    """Aware datetime in the hotel's time zone (America/Sao_Paulo)."""
    return timezone.make_aware(datetime(day.year, day.month, day.day, hour, minute, second))


def D(value):
    return Decimal(value)


class DailyRateTests(SimpleTestCase):
    def test_weekdays_cost_120(self):
        for day in (MON, TUE, WED, THU, FRI):
            with self.subTest(day=day):
                self.assertEqual(pricing.daily_rate(day), D('120.00'))

    def test_weekend_costs_180(self):
        for day in (SAT, SUN):
            with self.subTest(day=day):
                self.assertEqual(pricing.daily_rate(day), D('180.00'))

    def test_is_weekend(self):
        self.assertFalse(pricing.is_weekend(FRI))
        self.assertTrue(pricing.is_weekend(SAT))
        self.assertTrue(pricing.is_weekend(SUN))
        self.assertFalse(pricing.is_weekend(NEXT_MON))


class ParkingFeeTests(SimpleTestCase):
    def test_weekdays_cost_15(self):
        for day in (MON, TUE, WED, THU, FRI):
            with self.subTest(day=day):
                self.assertEqual(pricing.parking_fee(day), D('15.00'))

    def test_weekend_costs_20(self):
        for day in (SAT, SUN):
            with self.subTest(day=day):
                self.assertEqual(pricing.parking_fee(day), D('20.00'))


class NightsAndTotalsTests(SimpleTestCase):
    def test_single_weekday_night(self):
        bill = calculate_bill(MON, TUE, has_car=False)
        self.assertEqual(bill.nights_count, 1)
        self.assertEqual(bill.total, D('120.00'))

    def test_single_weekend_night(self):
        bill = calculate_bill(SAT, SUN, has_car=False)
        self.assertEqual(bill.total, D('180.00'))

    def test_each_night_is_priced_by_its_own_weekday(self):
        # Fri, Sat, Sun nights = 120 + 180 + 180
        bill = calculate_bill(FRI, NEXT_MON, has_car=False)
        self.assertEqual(bill.nights_count, 3)
        self.assertEqual([n.daily_rate for n in bill.nights], [D('120.00'), D('180.00'), D('180.00')])
        self.assertEqual(bill.daily_total, D('480.00'))
        self.assertEqual(bill.total, D('480.00'))

    def test_a_full_week_is_five_weekdays_and_two_weekend_days(self):
        bill = calculate_bill(MON, NEXT_MON, has_car=False)
        self.assertEqual(bill.nights_count, 7)
        self.assertEqual(bill.total, D('960.00'))  # 5*120 + 2*180

    def test_the_departure_day_is_not_charged_as_a_night(self):
        bill = calculate_bill(FRI, SAT, has_car=False)
        self.assertEqual([n.date for n in bill.nights], [FRI])

    def test_night_charges_flag_weekends(self):
        bill = calculate_bill(FRI, NEXT_MON, has_car=False)
        self.assertEqual([n.weekend for n in bill.nights], [False, True, True])

    def test_no_late_fee_when_there_is_no_checkout_time_yet(self):
        bill = calculate_bill(MON, TUE, has_car=False, checked_out_at=None)
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.late_checkout_fee, D('0.00'))


class ParkingInBillTests(SimpleTestCase):
    def test_no_car_means_no_parking_fee(self):
        bill = calculate_bill(FRI, NEXT_MON, has_car=False)
        self.assertEqual(bill.parking_total, D('0.00'))
        self.assertTrue(all(n.parking_fee == D('0.00') for n in bill.nights))

    def test_parking_weekday_night(self):
        bill = calculate_bill(MON, TUE, has_car=True)
        self.assertEqual(bill.parking_total, D('15.00'))
        self.assertEqual(bill.total, D('135.00'))  # 120 + 15

    def test_parking_weekend_night(self):
        bill = calculate_bill(SAT, SUN, has_car=True)
        self.assertEqual(bill.parking_total, D('20.00'))
        self.assertEqual(bill.total, D('200.00'))  # 180 + 20

    def test_parking_is_charged_per_night_with_weekday_weekend_variation(self):
        # Fri 15 + Sat 20 + Sun 20
        bill = calculate_bill(FRI, NEXT_MON, has_car=True)
        self.assertEqual(bill.parking_total, D('55.00'))
        self.assertEqual(bill.total, D('535.00'))  # 480 + 55


class LateCheckoutTests(SimpleTestCase):
    """Check-out is allowed until 12:00; after that: +50% of the day's rate."""

    def test_before_noon_is_free(self):
        bill = calculate_bill(MON, TUE, False, checked_out_at=at(TUE, 11, 59, 59))
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.total, D('120.00'))

    def test_exactly_noon_is_not_late(self):
        bill = calculate_bill(MON, TUE, False, checked_out_at=at(TUE, 12, 0, 0))
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.total, D('120.00'))

    def test_one_second_after_noon_is_late(self):
        bill = calculate_bill(MON, TUE, False, checked_out_at=at(TUE, 12, 0, 1))
        self.assertTrue(bill.late_checkout)

    def test_late_fee_on_weekday_is_half_of_120(self):
        bill = calculate_bill(MON, TUE, False, checked_out_at=at(TUE, 13, 0))
        self.assertEqual(bill.late_checkout_fee, D('60.00'))
        self.assertEqual(bill.total, D('180.00'))  # 120 + 60

    def test_late_fee_on_weekend_is_half_of_180(self):
        bill = calculate_bill(FRI, SAT, False, checked_out_at=at(SAT, 12, 30))
        self.assertEqual(bill.late_checkout_fee, D('90.00'))
        self.assertEqual(bill.total, D('210.00'))  # 120 + 90

    def test_late_fee_follows_the_departure_day_not_the_stay(self):
        # Stay Thu->Fri leaves on a Friday (weekday rate 120 -> fee 60)
        weekday = calculate_bill(THU, FRI, False, checked_out_at=at(FRI, 15, 0))
        # Stay Fri->Sun leaves on a Sunday (weekend rate 180 -> fee 90)
        weekend = calculate_bill(FRI, SUN, False, checked_out_at=at(SUN, 15, 0))
        self.assertEqual(weekday.late_checkout_fee, D('60.00'))
        self.assertEqual(weekend.late_checkout_fee, D('90.00'))

    def test_late_fee_does_not_include_parking(self):
        bill = calculate_bill(MON, TUE, True, checked_out_at=at(TUE, 14, 0))
        self.assertEqual(bill.late_checkout_fee, D('60.00'))
        self.assertEqual(bill.total, D('195.00'))  # 120 + 15 + 60

    def test_leaving_before_the_departure_day_is_never_late(self):
        """Regression: guest arrives Sat and leaves the same night (23:28),
        booked until Sun. No late fee: the deadline is Sun 12:00."""
        bill = calculate_bill(SAT, SUN, True, checked_out_at=at(SAT, 23, 28))
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.late_checkout_fee, D('0.00'))
        self.assertEqual(bill.total, D('200.00'))  # 180 + 20 parking

    def test_leaving_early_still_pays_the_booked_nights(self):
        # Booked Mon->Fri (4 nights), leaves Tue at 10:00
        bill = calculate_bill(MON, FRI, False, checked_out_at=at(TUE, 10, 0))
        self.assertEqual(bill.nights_count, 4)
        self.assertEqual(bill.total, D('480.00'))

    def test_overstay_is_billed_as_extra_nights(self):
        # Booked Sat->Sun, leaves Mon 10:00: nights Sat + Sun, no late fee
        bill = calculate_bill(SAT, SUN, False, checked_out_at=at(NEXT_MON, 10, 0))
        self.assertEqual(bill.nights_count, 2)
        self.assertFalse(bill.late_checkout)
        self.assertEqual(bill.total, D('360.00'))

    def test_overstay_after_noon_also_pays_late_fee_of_that_day(self):
        # Same as above but leaves Mon 13:00 (weekday: 50% of 120)
        bill = calculate_bill(SAT, SUN, False, checked_out_at=at(NEXT_MON, 13, 0))
        self.assertEqual(bill.nights_count, 2)
        self.assertEqual(bill.late_checkout_fee, D('60.00'))
        self.assertEqual(bill.total, D('420.00'))

    def test_late_fee_is_rounded_to_cents(self):
        self.assertEqual(pricing.daily_rate(MON) * pricing.LATE_CHECKOUT_FEE_RATIO, D('60.00'))
        bill = calculate_bill(MON, TUE, False, checked_out_at=at(TUE, 18, 0))
        self.assertEqual(bill.late_checkout_fee.as_tuple().exponent, -2)


class CheckInTimeTests(SimpleTestCase):
    """Check-in opens at 14:00; earlier attempts must trigger an alert."""

    def test_opening_time_is_14h(self):
        opens = pricing.check_in_opens_at(SAT)
        local = timezone.localtime(opens)
        self.assertEqual((local.date(), local.hour, local.minute), (SAT, 14, 0))

    def test_morning_is_early(self):
        self.assertTrue(pricing.is_early_check_in(SAT, at(SAT, 9, 0)))

    def test_one_second_before_14h_is_early(self):
        self.assertTrue(pricing.is_early_check_in(SAT, at(SAT, 13, 59, 59)))

    def test_exactly_14h_is_not_early(self):
        self.assertFalse(pricing.is_early_check_in(SAT, at(SAT, 14, 0)))

    def test_after_14h_is_not_early(self):
        self.assertFalse(pricing.is_early_check_in(SAT, at(SAT, 20, 0)))

    def test_the_day_before_is_early_even_at_night(self):
        self.assertTrue(pricing.is_early_check_in(SAT, at(FRI, 22, 0)))

    def test_a_later_day_is_not_early(self):
        self.assertFalse(pricing.is_early_check_in(SAT, at(SUN, 8, 0)))
