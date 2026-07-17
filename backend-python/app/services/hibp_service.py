"""Have I Been Pwned integration — verified against https://haveibeenpwned.com/API/v3.

Two independent checks:

1. check_email_breaches(email) — the v3 breachedaccount API. REQUIRES a paid
   HIBP subscription key (HIBP_API_KEY); without one the daily scan no-ops.
   Used by the daily Celery beat task (run_hibp_breach_scan) that walks
   registered accounts oldest-checked-first and records a security event +
   admin alert when an account shows up in a breach it wasn't known to be in.

2. password_is_pwned(password) — the Pwned Passwords range API. Free, no key,
   k-anonymity: only the first 5 chars of the SHA-1 ever leave the server, so
   the actual password is never transmitted. Gated by
   HIBP_PASSWORD_CHECK_ENABLED (default off) and wired into registration and
   password reset — the only moments plaintext exists (we store bcrypt hashes,
   so existing passwords can never be checked retroactively).

Both return None on any error (network, 429, bad key) — callers treat None as
"couldn't check", never as "safe" or "breached".
"""
import hashlib

import httpx

from app.core.config import get_settings
from app.services.feature_flags import get_flag
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_BREACH_ENDPOINT = "https://haveibeenpwned.com/api/v3/breachedaccount"
_PWNED_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range"
_USER_AGENT = "Parvagas-Security-Scan (https://parvagas.pt)"


def hibp_enabled() -> bool:
    """True when the breach API can be called (key configured)."""
    return bool(settings.HIBP_API_KEY)


def check_email_breaches(email: str) -> list[str] | None:
    """Names of breaches this email appears in; [] = clean; None = check failed.

    truncateResponse defaults to true server-side, so the response is a JSON
    array of {"Name": ...} objects — all we need for diffing against what we
    already alerted on.
    """
    if not hibp_enabled():
        return None
    try:
        resp = httpx.get(
            f"{_BREACH_ENDPOINT}/{email}",
            headers={"hibp-api-key": settings.HIBP_API_KEY, "user-agent": _USER_AGENT},
            timeout=15,
        )
        if resp.status_code == 404:  # documented: not found = not pwned
            return []
        if resp.status_code == 429:
            retry_after = resp.headers.get("retry-after", "?")
            logger.warning("HIBP rate limited (retry-after=%s); skipping %s", retry_after, email)
            return None
        if resp.status_code != 200:
            logger.warning("HIBP breach check failed (%s) for %s", resp.status_code, email)
            return None
        data = resp.json()
        if not isinstance(data, list):
            return None
        return sorted(
            str(item.get("Name")) for item in data
            if isinstance(item, dict) and item.get("Name")
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("HIBP breach check errored for %s: %s", email, exc)
        return None


def password_is_pwned(password: str) -> bool | None:
    """True if this password appears in known breach corpora; None = check failed.

    k-anonymity: SHA-1 the password, send only the first 5 hex chars, then
    look for our suffix in the returned "SUFFIX:COUNT" lines. No key needed.
    """
    if not get_flag("HIBP_PASSWORD_CHECK_ENABLED", settings.HIBP_PASSWORD_CHECK_ENABLED):
        return None
    try:
        sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = sha1[:5], sha1[5:]
        resp = httpx.get(
            f"{_PWNED_RANGE_ENDPOINT}/{prefix}",
            headers={"user-agent": _USER_AGENT},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning("Pwned Passwords range lookup failed (%s)", resp.status_code)
            return None
        for line in resp.text.splitlines():
            candidate, _, _count = line.strip().partition(":")
            if candidate.upper() == suffix:
                return True
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pwned Passwords check errored: %s", exc)
        return None
