"""Pricing rules. Pure functions: no database access, easy to unit test.

Rules (from the business spec):
  * Daily rate: Mon-Fri R$ 120,00 / Sat-Sun R$ 180,00
  * Parking (only if the guest has a car): Mon-Fri R$ 15,00 / Sat-Sun R$ 20,00 per day
  * Check-in allowed from 14:00 (earlier attempts only raise a warning)
  * Check-out until 12:00; later check-outs pay 50% of that day's rate
    (weekday/weekend variation respected)

A "day" (diária) is a night: one charge per date from `check_in_date` up to the
day *before* `check_out_date`, each priced by its own day of the week.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone

WEEKDAY_RATE = Decimal('120.00')
WEEKEND_RATE = Decimal('180.00')
WEEKDAY_PARKING_FEE = Decimal('15.00')
WEEKEND_PARKING_FEE = Decimal('20.00')

CHECK_IN_TIME = time(14, 0)
CHECK_OUT_TIME = time(12, 0)
LATE_CHECKOUT_FEE_RATIO = Decimal('0.50')

CENTS = Decimal('0.01')


def is_weekend(day: date) -> bool:
    return day.weekday() >= 5  # Saturday=5, Sunday=6


def daily_rate(day: date) -> Decimal:
    return WEEKEND_RATE if is_weekend(day) else WEEKDAY_RATE


def parking_fee(day: date) -> Decimal:
    return WEEKEND_PARKING_FEE if is_weekend(day) else WEEKDAY_PARKING_FEE


def check_in_opens_at(check_in_date: date) -> datetime:
    """Aware datetime (hotel time zone) from which check-in is allowed."""
    return timezone.make_aware(datetime.combine(check_in_date, CHECK_IN_TIME))


def is_early_check_in(check_in_date: date, now: datetime) -> bool:
    return timezone.localtime(now) < check_in_opens_at(check_in_date)


@dataclass(frozen=True)
class NightCharge:
    date: date
    weekend: bool
    daily_rate: Decimal
    parking_fee: Decimal


@dataclass(frozen=True)
class Bill:
    nights: tuple
    late_checkout: bool
    late_checkout_fee: Decimal

    @property
    def nights_count(self) -> int:
        return len(self.nights)

    @property
    def daily_total(self) -> Decimal:
        return sum((n.daily_rate for n in self.nights), Decimal('0.00'))

    @property
    def parking_total(self) -> Decimal:
        return sum((n.parking_fee for n in self.nights), Decimal('0.00'))

    @property
    def total(self) -> Decimal:
        return self.daily_total + self.parking_total + self.late_checkout_fee


def calculate_bill(
    check_in_date: date,
    check_out_date: date,
    has_car: bool,
    checked_out_at: datetime | None = None,
) -> Bill:
    """Compute the full bill of a stay.

    `checked_out_at` is the actual check-out moment. When given, it is used to:
      * apply the late check-out fee (after 12:00 on the booked departure day,
        or on a later day if the guest overstays);
      * bill extra nights if the guest stays past the booked `check_out_date`.
    Leaving earlier than booked does not reduce the bill (booked nights are due).
    Without it, the bill is the estimate for a punctual stay.
    """
    end = check_out_date
    late_checkout = False
    late_fee = Decimal('0.00')

    if checked_out_at is not None:
        left_at = timezone.localtime(checked_out_at)
        end = max(check_out_date, left_at.date())
        # Late only if the guest is still there after 12:00 on (or after) the
        # booked departure day. Leaving earlier than that day is never "late".
        if left_at.date() >= check_out_date and left_at.time() > CHECK_OUT_TIME:
            late_checkout = True
            late_fee = (daily_rate(left_at.date()) * LATE_CHECKOUT_FEE_RATIO).quantize(CENTS)

    nights = []
    day = check_in_date
    while day < end:
        nights.append(
            NightCharge(
                date=day,
                weekend=is_weekend(day),
                daily_rate=daily_rate(day),
                parking_fee=parking_fee(day) if has_car else Decimal('0.00'),
            )
        )
        day += timedelta(days=1)

    return Bill(nights=tuple(nights), late_checkout=late_checkout, late_checkout_fee=late_fee)
