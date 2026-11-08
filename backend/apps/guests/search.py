from django.db.models import Q

from .normalization import normalize_document, normalize_phone


def guest_search_q(prefix='', *, name=None, document=None, phone=None, term=None):
    """Build a Q to locate guests by name, document and/or phone.

    `prefix` lets other models reuse it through their relation (e.g.
    ``prefix='guest__'`` on Reservation). Specific params are ANDed together;
    `term` is a free-text search that matches ANY of the three fields.
    """
    q = Q()

    if name:
        q &= Q(**{f'{prefix}name__icontains': name.strip()})
    if document:
        q &= Q(**{f'{prefix}document__icontains': normalize_document(document)})
    if phone:
        q &= Q(**{f'{prefix}phone__icontains': normalize_phone(phone)})

    if term:
        term_q = Q(**{f'{prefix}name__icontains': term.strip()})
        document_term = normalize_document(term)
        if document_term:
            term_q |= Q(**{f'{prefix}document__icontains': document_term})
        phone_term = normalize_phone(term)
        if phone_term:
            term_q |= Q(**{f'{prefix}phone__icontains': phone_term})
        q &= term_q

    return q
