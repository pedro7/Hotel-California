"""Guest registry API: persistence, validation, search and hotel-presence filters."""

from datetime import date

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.guests.models import Guest
from apps.reservations.models import Reservation

Status = Reservation.Status


class GuestAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user('atendente', password='senha-forte-123')

    def setUp(self):
        self.client.force_authenticate(self.user)

    def make_guest(self, name='Maria Silva', document='52998224725', phone='11912345678'):
        return Guest.objects.create(name=name, document=document, phone=phone)

    def reserve(self, guest, status=Status.RESERVED):
        return Reservation.objects.create(
            guest=guest,
            check_in_date=date(2026, 11, 7),
            check_out_date=date(2026, 11, 8),
            status=status,
        )

    def names(self, query=''):
        response = self.client.get(f'/api/guests/{query}')
        self.assertEqual(response.status_code, 200)
        return [g['name'] for g in response.json()['results']]


class AccessTests(GuestAPITestCase):
    def test_login_is_required(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/guests/').status_code, 403)
        self.assertEqual(self.client.post('/api/guests/', {}, format='json').status_code, 403)

    def test_guests_cannot_be_deleted(self):
        guest = self.make_guest()
        self.assertEqual(self.client.delete(f'/api/guests/{guest.pk}/').status_code, 405)


class CreateGuestTests(GuestAPITestCase):
    payload = {'name': 'Maria Silva', 'document': '529.982.247-25', 'phone': '(11) 91234-5678'}

    def test_guest_is_persisted_with_the_minimum_information(self):
        response = self.client.post('/api/guests/', self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        guest = Guest.objects.get()
        self.assertEqual(guest.name, 'Maria Silva')
        self.assertEqual(guest.document, '52998224725')
        self.assertEqual(guest.phone, '11912345678')

    def test_document_and_phone_are_stored_normalized(self):
        body = self.client.post('/api/guests/', self.payload, format='json').json()
        self.assertEqual(body['document'], '52998224725')
        self.assertEqual(body['phone'], '11912345678')

    def test_name_is_trimmed(self):
        self.client.post('/api/guests/', {**self.payload, 'name': '  Maria Silva  '}, format='json')
        self.assertEqual(Guest.objects.get().name, 'Maria Silva')

    def test_name_document_and_phone_are_required(self):
        for field in ('name', 'document', 'phone'):
            with self.subTest(field=field):
                data = {k: v for k, v in self.payload.items() if k != field}
                response = self.client.post('/api/guests/', data, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())

    def test_blank_name_is_rejected(self):
        response = self.client.post('/api/guests/', {**self.payload, 'name': '   '}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.json())

    def test_duplicate_document_is_rejected(self):
        self.make_guest(document='52998224725')
        response = self.client.post('/api/guests/', self.payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('document', response.json())
        self.assertEqual(Guest.objects.count(), 1)

    def test_duplicate_is_detected_regardless_of_formatting(self):
        self.make_guest(document='52998224725')
        for variant in ('529.982.247-25', '529 982 247 25', '52998224725'):
            with self.subTest(variant=variant):
                response = self.client.post(
                    '/api/guests/', {**self.payload, 'document': variant}, format='json'
                )
                self.assertEqual(response.status_code, 400)

    def test_invalid_cpf_is_rejected(self):
        for cpf in ('123.456.789-00', '529.982.247-26', '111.111.111-11', '00000000000'):
            with self.subTest(cpf=cpf):
                response = self.client.post(
                    '/api/guests/', {**self.payload, 'document': cpf}, format='json'
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['document'], ['CPF inválido.'])
        self.assertEqual(Guest.objects.count(), 0)

    def test_valid_cpf_is_accepted_with_or_without_formatting(self):
        for cpf in ('529.982.247-25', '11144477735'):
            with self.subTest(cpf=cpf):
                response = self.client.post(
                    '/api/guests/', {**self.payload, 'document': cpf}, format='json'
                )
                self.assertEqual(response.status_code, 201)

    def test_other_documents_are_not_checked_as_cpf(self):
        # RG (9 digits) and passports (letters) are accepted as typed.
        for document in ('123456789', 'AB123456', '98.765.432-1'):
            with self.subTest(document=document):
                response = self.client.post(
                    '/api/guests/',
                    {**self.payload, 'document': document, 'name': f'Doc {document}'},
                    format='json',
                )
                self.assertEqual(response.status_code, 201)

    def test_editing_to_an_invalid_cpf_is_rejected(self):
        guest = self.make_guest(document='52998224725')
        response = self.client.patch(
            f'/api/guests/{guest.pk}/', {'document': '123.456.789-00'}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['document'], ['CPF inválido.'])

    def test_too_short_document_is_rejected(self):
        response = self.client.post('/api/guests/', {**self.payload, 'document': '12.3'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_phone_is_rejected(self):
        for phone in ('123', 'abc', '1' * 16):
            with self.subTest(phone=phone):
                response = self.client.post('/api/guests/', {**self.payload, 'phone': phone}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('phone', response.json())


class UpdateGuestTests(GuestAPITestCase):
    def test_guest_can_be_updated(self):
        guest = self.make_guest()
        response = self.client.patch(f'/api/guests/{guest.pk}/', {'phone': '(21) 98888-7777'}, format='json')
        self.assertEqual(response.status_code, 200)
        guest.refresh_from_db()
        self.assertEqual(guest.phone, '21988887777')

    def test_keeping_the_same_document_is_not_a_duplicate(self):
        guest = self.make_guest(document='52998224725')
        response = self.client.patch(
            f'/api/guests/{guest.pk}/', {'document': '529.982.247-25', 'name': 'Maria S.'}, format='json'
        )
        self.assertEqual(response.status_code, 200)

    def test_cannot_take_another_guests_document(self):
        self.make_guest(document='11144477735')
        other = self.make_guest(name='João', document='22222222222')
        response = self.client.patch(f'/api/guests/{other.pk}/', {'document': '111.444.777-35'}, format='json')
        self.assertEqual(response.status_code, 400)


class OrderingGuestTests(GuestAPITestCase):
    def setUp(self):
        super().setUp()
        self.make_guest('Carla', document='30000000000', phone='11900000003')
        self.make_guest('Ana', document='20000000000', phone='11900000002')
        self.make_guest('Bruno', document='10000000000', phone='11900000001')

    def test_default_order_is_alphabetical(self):
        self.assertEqual(self.names(), ['Ana', 'Bruno', 'Carla'])

    def test_order_by_name(self):
        self.assertEqual(self.names('?ordering=-name'), ['Carla', 'Bruno', 'Ana'])

    def test_order_by_document(self):
        self.assertEqual(self.names('?ordering=document'), ['Bruno', 'Ana', 'Carla'])
        self.assertEqual(self.names('?ordering=-document'), ['Carla', 'Ana', 'Bruno'])

    def test_order_by_phone(self):
        self.assertEqual(self.names('?ordering=phone'), ['Bruno', 'Ana', 'Carla'])

    def test_unknown_ordering_falls_back_to_the_default(self):
        self.assertEqual(self.names('?ordering=created_at'), ['Ana', 'Bruno', 'Carla'])

    def test_ordering_combines_with_search(self):
        self.assertEqual(self.names('?search=a&ordering=-name'), ['Carla', 'Ana'])


class SearchGuestTests(GuestAPITestCase):
    def setUp(self):
        super().setUp()
        self.make_guest('Maria Silva', '52998224725', '11912345678')
        self.make_guest('João Souza', '98765432100', '21988887777')
        self.make_guest('Mariana Costa', '55566677788', '31977776666')

    def test_search_by_name_is_partial_and_case_insensitive(self):
        self.assertEqual(sorted(self.names('?name=mari')), ['Maria Silva', 'Mariana Costa'])
        self.assertEqual(self.names('?name=SOUZA'), ['João Souza'])

    def test_search_by_document_accepts_formatted_input(self):
        self.assertEqual(self.names('?document=529.982.247-25'), ['Maria Silva'])

    def test_search_by_partial_document(self):
        self.assertEqual(self.names('?document=9876'), ['João Souza'])

    def test_search_by_phone_accepts_formatted_input(self):
        self.assertEqual(self.names('?phone=(21) 98888-7777'), ['João Souza'])

    def test_search_by_partial_phone(self):
        self.assertEqual(self.names('?phone=7776666'), ['Mariana Costa'])

    def test_free_text_search_matches_name_document_or_phone(self):
        self.assertEqual(self.names('?search=souza'), ['João Souza'])
        self.assertEqual(self.names('?search=55566677788'), ['Mariana Costa'])
        self.assertEqual(self.names('?search=(11) 91234'), ['Maria Silva'])

    def test_digits_inside_a_name_do_not_match_phones(self):
        # "Silva 77" used to be reduced to the digits "77" and match João's phone (…7777).
        self.assertEqual(self.names('?search=Silva 77'), [])
        self.assertEqual(self.names('?search=Maria Silva'), ['Maria Silva'])

    def test_specific_filters_combine_with_and(self):
        self.assertEqual(self.names('?name=mari&phone=3197'), ['Mariana Costa'])
        self.assertEqual(self.names('?name=joão&phone=3197'), [])

    def test_no_match_returns_empty_list(self):
        self.assertEqual(self.names('?search=zzz'), [])

    def test_without_filters_everyone_is_listed_alphabetically(self):
        self.assertEqual(self.names(), ['João Souza', 'Maria Silva', 'Mariana Costa'])


class PresenceFilterTests(GuestAPITestCase):
    """"Guests still in the hotel" and "guests with a reservation but no check-in"."""

    def setUp(self):
        super().setUp()
        self.in_hotel = self.make_guest('No Hotel', '11144477735', '11911111111')
        self.waiting = self.make_guest('Aguardando', '22222222222', '11922222222')
        self.gone = self.make_guest('Já Saiu', '33333333333', '11933333333')
        self.canceled = self.make_guest('Cancelou', '44444444444', '11944444444')
        self.nobody = self.make_guest('Sem Reserva', '55555555555', '11955555555')

        self.reserve(self.in_hotel, Status.CHECKED_IN)
        self.reserve(self.waiting, Status.RESERVED)
        self.reserve(self.gone, Status.CHECKED_OUT)
        self.reserve(self.canceled, Status.CANCELED)

    def test_in_hotel_lists_only_checked_in_guests(self):
        self.assertEqual(self.names('?in_hotel=true'), ['No Hotel'])

    def test_awaiting_check_in_lists_only_guests_with_pending_reservation(self):
        self.assertEqual(self.names('?awaiting_check_in=true'), ['Aguardando'])

    def test_false_or_missing_flag_does_not_filter(self):
        self.assertEqual(len(self.names('?in_hotel=false')), 5)
        self.assertEqual(len(self.names()), 5)

    def test_guest_with_several_pending_reservations_appears_once(self):
        self.reserve(self.waiting, Status.RESERVED)
        self.reserve(self.waiting, Status.RESERVED)
        self.assertEqual(self.names('?awaiting_check_in=true'), ['Aguardando'])

    def test_guest_appears_in_both_lists_when_applicable(self):
        self.reserve(self.in_hotel, Status.RESERVED)  # future stay while still in the hotel
        self.assertEqual(self.names('?in_hotel=true'), ['No Hotel'])
        self.assertEqual(sorted(self.names('?awaiting_check_in=true')), ['Aguardando', 'No Hotel'])

    def test_presence_filter_combines_with_search(self):
        self.assertEqual(self.names('?in_hotel=true&search=hotel'), ['No Hotel'])
        self.assertEqual(self.names('?in_hotel=true&search=aguardando'), [])

    def test_guest_leaves_the_in_hotel_list_after_checkout(self):
        Reservation.objects.filter(guest=self.in_hotel).update(status=Status.CHECKED_OUT)
        self.assertEqual(self.names('?in_hotel=true'), [])
