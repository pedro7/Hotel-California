"""Check-in / check-out workflows. Views stay thin; rules live here."""

from django.db import transaction
from django.utils import timezone

from . import pricing
from .models import Reservation


class ReservationError(Exception):
    code = 'reservation_error'

    def __init__(self, message):
        super().__init__(message)
        self.message = message


class InvalidStatusTransition(ReservationError):
    code = 'invalid_status'


class EarlyCheckInNotConfirmed(ReservationError):
    """Check-in attempted before 14:00. The attendant must confirm to proceed."""

    code = 'early_check_in'

    def __init__(self, allowed_from):
        super().__init__(
            'Check-in antes das 14h00. Confirme para realizar o check-in antecipado.'
        )
        self.allowed_from = allowed_from


def _locked(reservation_id):
    return Reservation.objects.select_for_update().select_related('guest').get(pk=reservation_id)


@transaction.atomic
def check_in(reservation_id, *, confirm_early=False, now=None) -> Reservation:
    reservation = _locked(reservation_id)
    now = now or timezone.now()

    if reservation.status != Reservation.Status.RESERVED:
        raise InvalidStatusTransition(
            'Só é possível fazer check-in de reservas com status "Reservada".'
        )

    if pricing.is_early_check_in(reservation.check_in_date, now) and not confirm_early:
        raise EarlyCheckInNotConfirmed(pricing.check_in_opens_at(reservation.check_in_date))

    reservation.status = Reservation.Status.CHECKED_IN
    reservation.checked_in_at = now
    reservation.save(update_fields=['status', 'checked_in_at', 'updated_at'])
    return reservation


def bill_for(reservation: Reservation, *, now=None) -> pricing.Bill:
    """Bill for the reservation: final if checked out, otherwise computed as if
    the guest left right now."""
    if reservation.status == Reservation.Status.CHECKED_OUT:
        left_at = reservation.checked_out_at
    elif reservation.status == Reservation.Status.CHECKED_IN:
        left_at = now or timezone.now()
    else:
        left_at = None  # not staying yet: estimate for a punctual stay
    return pricing.calculate_bill(
        reservation.check_in_date, reservation.check_out_date, reservation.has_car, left_at
    )


@transaction.atomic
def check_out(reservation_id, *, now=None):
    """Returns ``(reservation, bill)``; the bill total is frozen on the reservation."""
    reservation = _locked(reservation_id)
    now = now or timezone.now()

    if reservation.status != Reservation.Status.CHECKED_IN:
        raise InvalidStatusTransition(
            'Só é possível fazer check-out de reservas com check-in realizado.'
        )

    bill = pricing.calculate_bill(
        reservation.check_in_date, reservation.check_out_date, reservation.has_car, now
    )
    reservation.status = Reservation.Status.CHECKED_OUT
    reservation.checked_out_at = now
    reservation.total_amount = bill.total
    reservation.save(update_fields=['status', 'checked_out_at', 'total_amount', 'updated_at'])
    return reservation, bill


@transaction.atomic
def cancel(reservation_id) -> Reservation:
    reservation = _locked(reservation_id)
    if reservation.status != Reservation.Status.RESERVED:
        raise InvalidStatusTransition('Só é possível cancelar reservas com status "Reservada".')
    reservation.status = Reservation.Status.CANCELED
    reservation.save(update_fields=['status', 'updated_at'])
    return reservation
