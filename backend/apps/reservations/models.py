from django.db import models
from django.db.models import F, Q

from apps.guests.models import Guest


class Reservation(models.Model):
    class Status(models.TextChoices):
        RESERVED = 'RESERVED', 'Reservada'
        CHECKED_IN = 'CHECKED_IN', 'Check-in realizado'
        CHECKED_OUT = 'CHECKED_OUT', 'Check-out realizado'
        CANCELED = 'CANCELED', 'Cancelada'

    guest = models.ForeignKey(Guest, on_delete=models.PROTECT, related_name='reservations')
    check_in_date = models.DateField()
    check_out_date = models.DateField()
    has_car = models.BooleanField(
        default=False, help_text='O hóspede utilizará a vaga de estacionamento.'
    )
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.RESERVED, db_index=True
    )
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    # Final amount, frozen at check-out so later rate changes never alter history.
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-check_in_date', '-id']
        constraints = [
            models.CheckConstraint(
                condition=Q(check_out_date__gt=F('check_in_date')),
                name='reservation_checkout_after_checkin',
            ),
        ]

    def __str__(self):
        return f'Reserva #{self.pk} - {self.guest.name} ({self.check_in_date} → {self.check_out_date})'
