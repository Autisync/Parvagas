"""Pluggable CAPTCHA verification (anti-abuse on register/apply).

No-ops (allows) when unconfigured so flows keep working in dev. Enable in prod
by setting CAPTCHA_PROVIDER (turnstile|hcaptcha|recaptcha) + CAPTCHA_SECRET,
and CAPTCHA_REQUIRED=true to reject missing/invalid tokens.
"""
from __future__ import annotations

import os

from app.core.logging import get_logger

logger = get_logger(__name__)

_VERIFY_URLS = {
    "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    "hcaptcha": "https://hcaptcha.com/siteverify",
    "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
}


def captcha_required() -> bool:
    return os.getenv("CAPTCHA_REQUIRED", "false").lower() == "true" and bool(os.getenv("CAPTCHA_SECRET"))


def verify_captcha(token: str | None, remote_ip: str | None = None) -> bool:
    """Return True if the captcha passes (or isn't configured/required)."""
    secret = os.getenv("CAPTCHA_SECRET", "")
    provider = os.getenv("CAPTCHA_PROVIDER", "turnstile").lower()
    if not secret or not captcha_required():
        return True  # not enforced
    if not token:
        return False
    url = _VERIFY_URLS.get(provider)
    if not url:
        logger.warning("Unknown CAPTCHA_PROVIDER '%s'; allowing", provider)
        return True
    try:
        import httpx

        data = {"secret": secret, "response": token}
        if remote_ip:
            data["remoteip"] = remote_ip
        resp = httpx.post(url, data=data, timeout=8)
        return bool(resp.json().get("success")) if resp.status_code == 200 else False
    except Exception as exc:  # pragma: no cover - network/defensive
        logger.warning("CAPTCHA verify failed: %s", exc)
        return False
