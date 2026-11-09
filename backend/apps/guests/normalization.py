"""Normalization of guest identifiers so searches and uniqueness are consistent
regardless of how the attendant typed them ("123.456.789-00" vs "12345678900")."""

import re


def normalize_document(value: str) -> str:
    """Strip separators/whitespace and upper-case (documents may contain letters,
    e.g. passports)."""
    return re.sub(r'[\s.\-/]', '', value or '').upper()


def normalize_phone(value: str) -> str:
    """Keep digits only: "(11) 91234-5678" -> "11912345678"."""
    return re.sub(r'\D', '', value or '')


def is_valid_cpf(value: str) -> bool:
    """True when ``value`` (11 digits, already normalized) has valid CPF check digits."""
    if not re.fullmatch(r'\d{11}', value or '') or len(set(value)) == 1:
        return False
    digits = [int(c) for c in value]
    for position in (9, 10):
        total = sum(d * w for d, w in zip(digits[:position], range(position + 1, 1, -1)))
        check = (total * 10 % 11) % 10
        if digits[position] != check:
            return False
    return True
