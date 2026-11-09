from django.db.models import Exists, OuterRef
from rest_framework import mixins, viewsets

from apps.reservations.models import Reservation

from .models import Guest
from .search import guest_search_q
from .serializers import GuestSerializer

TRUE_VALUES = {'1', 'true', 'yes'}


def _is_true(value):
    return str(value).lower() in TRUE_VALUES


class GuestViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Guest registry.

    Query params for the list endpoint:
      - ``name``, ``document``, ``phone``: partial match, combined with AND
      - ``search``: free text matched against name OR document OR phone
      - ``in_hotel=true``: guests currently checked in
      - ``awaiting_check_in=true``: guests with a reservation not yet checked in
      - ``ordering``: one of name, document, phone; prefix with ``-`` for descending.
        Default: ``name``.
    """

    serializer_class = GuestSerializer

    ORDERING_FIELDS = {'name', 'document', 'phone'}

    def _ordering(self):
        requested = self.request.query_params.get('ordering', '')
        if requested.lstrip('-') not in self.ORDERING_FIELDS:
            return ['name', 'id']
        return [requested, 'id']  # id as a stable tiebreaker

    def get_queryset(self):
        params = self.request.query_params
        qs = Guest.objects.all()

        qs = qs.filter(
            guest_search_q(
                name=params.get('name'),
                document=params.get('document'),
                phone=params.get('phone'),
                term=params.get('search'),
            )
        )

        if _is_true(params.get('in_hotel', '')):
            qs = qs.filter(
                Exists(
                    Reservation.objects.filter(
                        guest=OuterRef('pk'), status=Reservation.Status.CHECKED_IN
                    )
                )
            )
        if _is_true(params.get('awaiting_check_in', '')):
            qs = qs.filter(
                Exists(
                    Reservation.objects.filter(
                        guest=OuterRef('pk'), status=Reservation.Status.RESERVED
                    )
                )
            )
        return qs.order_by(*self._ordering())
