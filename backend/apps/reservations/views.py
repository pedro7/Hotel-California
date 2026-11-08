from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.guests.search import guest_search_q

from . import services
from .models import Reservation
from .serializers import BillSerializer, CheckInSerializer, ReservationSerializer


class ReservationViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Reservations, plus the attendant workflows (check-in, check-out, cancel).

    Query params for the list endpoint:
      - ``status``: one or more of RESERVED, CHECKED_IN, CHECKED_OUT, CANCELED
        (comma separated). ``status=CHECKED_IN`` = guests still in the hotel;
        ``status=RESERVED`` = reservations awaiting check-in.
      - ``guest``: guest id
      - ``name``, ``document``, ``phone``, ``search``: guest lookup (see guests)
    """

    serializer_class = ReservationSerializer

    def get_queryset(self):
        params = self.request.query_params
        qs = Reservation.objects.select_related('guest')

        statuses = [s.strip().upper() for s in params.get('status', '').split(',') if s.strip()]
        if statuses:
            qs = qs.filter(status__in=statuses)
        if params.get('guest', '').isdigit():
            qs = qs.filter(guest_id=params['guest'])

        return qs.filter(
            guest_search_q(
                'guest__',
                name=params.get('name'),
                document=params.get('document'),
                phone=params.get('phone'),
                term=params.get('search'),
            )
        )

    @staticmethod
    def _error(exc):
        body = {'code': exc.code, 'detail': exc.message}
        if isinstance(exc, services.EarlyCheckInNotConfirmed):
            body['allowed_from'] = exc.allowed_from.isoformat()
        return Response(body, status=status.HTTP_409_CONFLICT)

    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Without ``confirm_early`` an attempt before 14:00 returns 409 with
        ``code=early_check_in`` (the alert); resend with ``confirm_early=true``
        to proceed."""
        reservation = self.get_object()
        body = CheckInSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            reservation = services.check_in(
                reservation.pk, confirm_early=body.validated_data['confirm_early']
            )
        except services.ReservationError as exc:
            return self._error(exc)
        return Response(self.get_serializer(reservation).data)

    @action(detail=True, methods=['get'])
    def bill(self, request, pk=None):
        """Detailed bill. Final for checked-out reservations; for a guest still in
        the hotel it is the amount due if they left right now (preview)."""
        reservation = self.get_object()
        return Response(BillSerializer(services.bill_for(reservation)).data)

    @action(detail=True, methods=['post'], url_path='check-out')
    def check_out(self, request, pk=None):
        """Checks the guest out and returns the reservation with the detailed bill."""
        reservation = self.get_object()
        try:
            reservation, bill = services.check_out(reservation.pk)
        except services.ReservationError as exc:
            return self._error(exc)
        return Response(
            {
                'reservation': self.get_serializer(reservation).data,
                'bill': BillSerializer(bill).data,
            }
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        try:
            reservation = services.cancel(reservation.pk)
        except services.ReservationError as exc:
            return self._error(exc)
        return Response(self.get_serializer(reservation).data)
