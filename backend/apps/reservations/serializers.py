from django.utils import timezone
from rest_framework import serializers

from apps.guests.serializers import GuestSerializer

from .models import Reservation


class ReservationSerializer(serializers.ModelSerializer):
    guest_detail = GuestSerializer(source='guest', read_only=True)

    class Meta:
        model = Reservation
        fields = [
            'id',
            'guest',
            'guest_detail',
            'check_in_date',
            'check_out_date',
            'has_car',
            'status',
            'checked_in_at',
            'checked_out_at',
            'total_amount',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'checked_in_at',
            'checked_out_at',
            'total_amount',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != Reservation.Status.RESERVED:
            raise serializers.ValidationError(
                'Só é possível alterar reservas com status "Reservada".'
            )

        check_in = attrs.get('check_in_date', getattr(self.instance, 'check_in_date', None))
        check_out = attrs.get('check_out_date', getattr(self.instance, 'check_out_date', None))

        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError(
                {'check_out_date': 'A data de saída deve ser posterior à data de entrada.'}
            )
        if (
            'check_in_date' in attrs
            and attrs['check_in_date'] < timezone.localdate()
            and (self.instance is None or attrs['check_in_date'] != self.instance.check_in_date)
        ):
            raise serializers.ValidationError(
                {'check_in_date': 'A data de entrada não pode estar no passado.'}
            )

        guest = attrs.get('guest', getattr(self.instance, 'guest', None))
        if guest and check_in and check_out:
            # Same-day turnover is fine: a stay ending on D doesn't clash with one starting on D.
            clashes = Reservation.objects.filter(
                guest=guest,
                status__in=[Reservation.Status.RESERVED, Reservation.Status.CHECKED_IN],
                check_in_date__lt=check_out,
                check_out_date__gt=check_in,
            )
            if self.instance is not None:
                clashes = clashes.exclude(pk=self.instance.pk)
            if clashes.exists():
                raise serializers.ValidationError(
                    'Este hóspede já possui uma reserva ou hospedagem ativa neste período.'
                )
        return attrs


class CheckInSerializer(serializers.Serializer):
    confirm_early = serializers.BooleanField(default=False)


class NightChargeSerializer(serializers.Serializer):
    date = serializers.DateField()
    weekend = serializers.BooleanField()
    daily_rate = serializers.DecimalField(max_digits=10, decimal_places=2)
    parking_fee = serializers.DecimalField(max_digits=10, decimal_places=2)


class BillSerializer(serializers.Serializer):
    nights = NightChargeSerializer(many=True)
    nights_count = serializers.IntegerField()
    daily_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    parking_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    late_checkout = serializers.BooleanField()
    late_checkout_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
