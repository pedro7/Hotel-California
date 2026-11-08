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
