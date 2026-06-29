"""Locale-aware date parsing for CVs (Portuguese + English).

Normalises the many ways CVs write dates into a single canonical form:
  - ``YYYY-MM`` when a month is known,
  - ``YYYY`` when only the year is known,
  - ``"present"`` for ongoing roles.

Handles Portuguese month names/abbreviations and "still ongoing" tokens
(``Presente``, ``Atual``, ``até à data`` …) at the same bar as English.
"""
from __future__ import annotations

import re
import unicodedata

__all__ = ["normalize_date", "parse_date_range", "PRESENT"]

PRESENT = "present"

def _strip(text: str) -> str:
    """Lower-case and remove diacritics so 'Março' == 'marco'."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


# Month name/abbreviation → number, Portuguese and English. Keys are stored
# diacritic-free and lower-case; lookups strip accents first.
_MONTHS: dict[str, int] = {}


def _add_months(names: list[str], number: int) -> None:
    for name in names:
        _MONTHS[_strip(name)] = number


# Portuguese
_add_months(["janeiro", "jan"], 1)
_add_months(["fevereiro", "fev"], 2)
_add_months(["marco", "mar"], 3)
_add_months(["abril", "abr"], 4)
_add_months(["maio", "mai"], 5)
_add_months(["junho", "jun"], 6)
_add_months(["julho", "jul"], 7)
_add_months(["agosto", "ago"], 8)
_add_months(["setembro", "set", "sep"], 9)
_add_months(["outubro", "out", "oct"], 10)
_add_months(["novembro", "nov"], 11)
_add_months(["dezembro", "dez", "dec"], 12)
# English (where different from PT)
_add_months(["january", "jan"], 1)
_add_months(["february", "feb"], 2)
_add_months(["march"], 3)
_add_months(["april", "apr"], 4)
_add_months(["may"], 5)
_add_months(["june"], 6)
_add_months(["july"], 7)
_add_months(["august", "aug"], 8)
_add_months(["september"], 9)
_add_months(["october"], 10)
_add_months(["november"], 11)
_add_months(["december"], 12)

# Ongoing-role tokens (diacritic-free, lower-case).
_PRESENT_TOKENS = {
    "present", "current", "now", "presente", "atual", "atualmente",
    "atualidade", "ate a data", "ate ao momento", "em curso", "hoje",
}

# Range separators seen between start and end dates.
_RANGE_SPLIT = re.compile(r"\s*(?:[-–—]|\bto\b|\bate\b|\baté\b)\s*", re.IGNORECASE)


def normalize_date(token: str | None) -> str | None:
    """Normalise a single date token to ``YYYY-MM`` / ``YYYY`` / ``present``.

    Returns ``None`` when no date can be confidently recovered.
    """
    if not token:
        return None
    raw = _strip(token)
    if not raw:
        return None

    # Ongoing markers.
    if any(tok in raw for tok in _PRESENT_TOKENS):
        return PRESENT

    # ISO-ish: 2020-01 / 2020/01 / 2020.01
    m = re.search(r"\b(19|20)(\d{2})[-/.](0?[1-9]|1[0-2])\b", raw)
    if m:
        return f"{m.group(1)}{m.group(2)}-{int(m.group(3)):02d}"

    # MM/YYYY or M/YYYY  (also MM-YYYY, MM.YYYY)
    m = re.search(r"\b(0?[1-9]|1[0-2])[-/.](19|20)(\d{2})\b", raw)
    if m:
        return f"{m.group(2)}{m.group(3)}-{int(m.group(1)):02d}"

    # Month-name YYYY  ("janeiro de 2020", "jan 2020", "January 2020", "jan/2020")
    m = re.search(r"\b([a-z]{3,9})\.?\s*(?:de\s+|/)?\s*(19|20)(\d{2})\b", raw)
    if m and _strip(m.group(1)) in _MONTHS:
        month = _MONTHS[_strip(m.group(1))]
        return f"{m.group(2)}{m.group(3)}-{month:02d}"

    # Bare year.
    m = re.search(r"\b(19|20)(\d{2})\b", raw)
    if m:
        return f"{m.group(1)}{m.group(2)}"

    return None


def parse_date_range(text: str | None) -> tuple[str | None, str | None]:
    """Parse a 'start – end' style range. Returns (start, end).

    ``end`` is ``"present"`` for ongoing roles. Either side may be ``None``.
    """
    if not text:
        return None, None
    raw = text.strip()

    # Check for an ongoing marker BEFORE splitting — phrases like "até à data"
    # contain a separator-looking word ("até") that must not be split apart.
    if any(tok in _strip(raw) for tok in _PRESENT_TOKENS):
        parts = _RANGE_SPLIT.split(raw, maxsplit=1)
        start = normalize_date(parts[0]) if parts else None
        if start == PRESENT:  # only the marker, no real start date
            start = None
        return start, PRESENT

    # Split on the first range separator that sits between two date chunks.
    parts = _RANGE_SPLIT.split(raw, maxsplit=1)
    if len(parts) == 2:
        return normalize_date(parts[0]), normalize_date(parts[1])

    # Single token: just a start.
    return normalize_date(raw), None
