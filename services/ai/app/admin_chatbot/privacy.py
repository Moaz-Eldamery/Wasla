"""Redact common direct identifiers before questions leave the AI service."""

import re

_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_EGYPTIAN_ID = re.compile(r"(?<!\d)\d{14}(?!\d)")
_UUID = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_PHONE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")
_ENGLISH_NAMED_PATIENT = re.compile(
    r"\b(?:patient(?:\s+name)?|my name is)\s*[:=]?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b",
    re.IGNORECASE,
)
_ARABIC_NAMED_PATIENT = re.compile(
    r"(?:اسم المريض|اسم المريضة|المريض|المريضة)\s*[:：=]?\s*"
    r"[\u0621-\u064a]+(?:\s+[\u0621-\u064a]+){0,2}"
)


def redact_direct_identifiers(text: str) -> str:
    """Remove common contact, government-ID, UUID, and labeled patient-name data."""
    redacted = _EMAIL.sub("[REDACTED]", text)
    redacted = _EGYPTIAN_ID.sub("[REDACTED]", redacted)
    redacted = _UUID.sub("[REDACTED]", redacted)
    redacted = _PHONE.sub("[REDACTED]", redacted)
    redacted = _ENGLISH_NAMED_PATIENT.sub("[REDACTED]", redacted)
    return _ARABIC_NAMED_PATIENT.sub("[REDACTED]", redacted)
