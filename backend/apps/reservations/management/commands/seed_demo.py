"""Fills the database with demo guests and reservations (for manual checks and e2e tests).

Demo guests use documents starting with ``999`` so they are easy to find and remove.
Running it twice does not duplicate anything.
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.guests.models import Guest
from apps.reservations.models import Reservation

Status = Reservation.Status

FIRST_NAMES = [
    'Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João',
    'Karen', 'Lucas', 'Marina', 'Nelson', 'Olívia', 'Paulo', 'Quésia', 'Rafael', 'Sofia', 'Tiago',
    'Úrsula', 'Vitor', 'Wesley', 'Yara', 'Zeca',
]
LAST_NAMES = [
    'Almeida', 'Barros', 'Cardoso', 'Dias', 'Esteves', 'Ferreira', 'Gomes', 'Henriques', 'Lima',
    'Machado', 'Nogueira', 'Oliveira', 'Pereira', 'Ramos', 'Santos', 'Teixeira',
]


def _aware(day, hour):
    return timezone.make_aware(datetime.combine(day, time(hour, 0)))


class Command(BaseCommand):
    help = 'Creates demo guests (one reservation each) and, optionally, an attendant user.'

    def add_arguments(self, parser):
        parser.add_argument('--guests', type=int, default=55, help='how many demo guests (default 55)')
        parser.add_argument('--user', help='also create this attendant user if it does not exist')
        parser.add_argument('--password', default='senha-forte-123', help='password for --user')

    def handle(self, *args, guests, user, password, **options):
        if user:
            User = get_user_model()
            if not User.objects.filter(username=user).exists():
                User.objects.create_user(user, password=password)
                self.stdout.write(f'user "{user}" created')

        rng = random.Random(7)
        today = timezone.localdate()
        statuses = (
            [Status.RESERVED] * 33
            + [Status.CHECKED_IN] * 15
            + [Status.CHECKED_OUT] * 40
            + [Status.CANCELED] * 12
        )
        created = 0
        for i in range(guests):
            document = f'999{i:08d}'
            if Guest.objects.filter(document=document).exists():
                continue
            status = statuses[(i * 7) % len(statuses)]
            guest = Guest.objects.create(
                name=f'{FIRST_NAMES[i % len(FIRST_NAMES)]} {LAST_NAMES[(i * 3) % len(LAST_NAMES)]} {i + 1:02d}',
                document=document,
                phone=f'1190000{i:04d}',
            )
            nights = rng.randint(1, 5)
            if status == Status.RESERVED:
                check_in = today + timedelta(days=rng.randint(0, 30))
            elif status == Status.CHECKED_IN:
                check_in = today - timedelta(days=rng.randint(0, 2))
                nights = rng.randint(2, 5)
            elif status == Status.CHECKED_OUT:
                check_in = today - timedelta(days=rng.randint(6, 90))
            else:
                check_in = today + timedelta(days=rng.randint(-10, 30))
            check_out = check_in + timedelta(days=nights)

            reservation = Reservation.objects.create(
                guest=guest,
                check_in_date=check_in,
                check_out_date=check_out,
                has_car=rng.random() < 0.4,
                status=status,
            )
            if status in (Status.CHECKED_IN, Status.CHECKED_OUT):
                reservation.checked_in_at = _aware(check_in, 15)
            if status == Status.CHECKED_OUT:
                reservation.checked_out_at = _aware(check_out, 11)
                reservation.total_amount = Decimal(nights * 120 + (nights * 15 if reservation.has_car else 0))
            reservation.save()
            created += 1
        self.stdout.write(self.style.SUCCESS(f'{created} demo guests with reservations created'))
