from django.test import SimpleTestCase

from apps.guests.normalization import normalize_document, normalize_phone


class NormalizeDocumentTests(SimpleTestCase):
    def test_removes_cpf_punctuation(self):
        self.assertEqual(normalize_document('123.456.789-00'), '12345678900')

    def test_removes_spaces_and_slashes(self):
        self.assertEqual(normalize_document(' 12 345/678 '), '12345678')

    def test_passport_letters_are_uppercased(self):
        self.assertEqual(normalize_document('ab-123456'), 'AB123456')

    def test_empty_values(self):
        self.assertEqual(normalize_document(''), '')
        self.assertEqual(normalize_document(None), '')


class NormalizePhoneTests(SimpleTestCase):
    def test_keeps_digits_only(self):
        self.assertEqual(normalize_phone('(11) 91234-5678'), '11912345678')

    def test_international_format(self):
        self.assertEqual(normalize_phone('+55 11 91234-5678'), '5511912345678')

    def test_empty_values(self):
        self.assertEqual(normalize_phone(''), '')
        self.assertEqual(normalize_phone(None), '')
