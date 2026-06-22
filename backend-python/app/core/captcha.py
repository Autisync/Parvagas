"""Pluggable CAPTCHA verification (anti-abuse on login/register/apply).

Supports reCAPTCHA **Enterprise** (assessment API) plus the classic
turnstile/hcaptcha/recaptcha siteverify endpoints. No-ops (allows) when
unconfigured so flows keep working in dev. Enable in prod by setting
CAPTCHA_PROVIDER + the provider creds, and CAPTCHA_REQUIRED=true to enforce.

reCAPTCHA Enterprise env:
  CAPTCHA_PROVIDER=recaptcha_enterprise
  CAPTCHA_REQUIRED=true
  RECAPTCHA_PROJECT_ID=parvagas
  RECAPTCHA_API_KEY=<google api key>
  RECAPTCHA_SITE_KEY=6Lf4CistAAAAAIq1r40uoJLlTspXn_05-0pz9zJc
  RECAPTCHA_SCORE_THRESHOLD=0.5
"""
from __future__ import annotations

import os

from app.core.logging import get_logger

logger = get_logger(__name__)

_SITEVERIFY_URLS = {
    "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    "hcaptcha": "https://hcaptcha.com/siteverify",
    "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
}

DEFAULT_SITE_KEY = "6Lf4CistAAAAAIq1r40uoJLlTspXn_05-0pz9zJc"


def _provider() -> str:
    return os.getenv("CAPTCHA_PROVIDER", "").strip().lower()


def captcha_required() -> bool:
    """True only when enforcement is on AND the provider has its credential."""
    if os.getenv("CAPTCHA_REQUIRED", "false").lower() != "true":
        return False
    p = _provider()
    if p == "recaptcha_enterprise":
        return bool(os.getenv("RECAPTCHA_API_KEY"))
    return bool(os.getenv("CAPTCHA_SECRET"))


def _verify_enterprise(token: str, action: str | None, remote_ip: str | None) -> bool:
    project = os.getenv("RECAPTCHA_PROJECT_ID", "parvagas")
    api_key = os.getenv("RECAPTCHA_API_KEY", "")
    site_key = os.getenv("RECAPTCHA_SITE_KEY", DEFAULT_SITE_KEY)
    threshold = float(os.getenv("RECAPTCHA_SCORE_THRESHOLD", "0.5"))
    if not api_key:
        return True  # not configured
    event: dict = {"token": token, "siteKey": site_key}
    if action:
        event["expectedAction"] = action
    if remote_ip:
        event["userIpAddress"] = remote_ip
    try:
        import httpx

        url = f"https://recaptchaenterprise.googleapis.com/v1/projects/{project}/assessments?key={api_key}"
        resp = httpx.post(url, json={"event": event}, timeout=8)
        if resp.status_code != 200:
            logger.warning("reCAPTCHA Enterprise HTTP %s: %s", resp.status_code, resp.text[:200])
            return False
        data = resp.json()
        token_props = data.get("tokenProperties", {})
        if not token_props.get("valid"):
            logger.info("reCAPTCHA token invalid: %s", token_props.get("invalidReason"))
            return False
        if action and token_props.get("action") and token_props["action"] != action:
            logger.info("reCAPTCHA action mismatch: %s != %s", token_props.get("action"), action)
            return False
        score = float(data.get("riskAnalysis", {}).get("score", 0.0))
        return score >= threshold
    except Exception as exc:  # pragma: no cover - network/defensive
        logger.warning("reCAPTCHA Enterprise verify failed: %s", exc)
        return False


def _verify_siteverify(token: str, remote_ip: str | None) -> bool:
    secret = os.getenv("CAPTCHA_SECRET", "")
    url = _SITEVERIFY_URLS.get(_provider())
    if not secret or not url:
        return True
    try:
        import httpx

        data = {"secret": secret, "response": token}
        if remote_ip:
            data["remoteip"] = remote_ip
        resp = httpx.post(url, data=data, timeout=8)
        return bool(resp.json().get("success")) if resp.status_code == 200 else False
    except Exception as exc:  # pragma: no cover
        logger.warning("CAPTCHA verify failed: %s", exc)
        return False


def verify_captcha(token: str | None, action: str | None = None, remote_ip: str | None = None) -> bool:
    """Return True if the captcha passes (or isn't enforced)."""
    if not captcha_required():
        return True
    if not token:
        return False
    if _provider() == "recaptcha_enterprise":
        return _verify_enterprise(token, action, remote_ip)
    return _verify_siteverify(token, remote_ip)
