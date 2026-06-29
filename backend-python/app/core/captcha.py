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
  RECAPTCHA_SITE_KEY=6LfLODItAAAAABwHKetsgIlJJLM7t45ZpoHmYidQ
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

DEFAULT_SITE_KEY = "6LfLODItAAAAABwHKetsgIlJJLM7t45ZpoHmYidQ"


def _clean_env(name: str, default: str = "") -> str:
    """Read a single-token credential env var defensively.

    Portainer / .env paste mistakes routinely leave a trailing newline or glue
    the next `KEY=value` onto a value (we have seen SENTRY_DSN come through as
    '…/4511615953862736APP_ENV=production'). None of the captcha credentials
    contain spaces, so we strip surrounding whitespace AND keep only the first
    whitespace-delimited token. That neutralises a trailing newline or a
    space/newline-glued next variable. (Direct concatenation with no separator
    at all still can't be recovered — fix the env in that case.)
    """
    raw = (os.getenv(name, default) or "").strip()
    return raw.split()[0] if raw else ""


def _provider() -> str:
    return _clean_env("CAPTCHA_PROVIDER").lower()


def captcha_required() -> bool:
    """True only when enforcement is on AND the provider has its credential."""
    if _clean_env("CAPTCHA_REQUIRED", "false").lower() != "true":
        return False
    p = _provider()
    if p == "recaptcha_enterprise":
        return bool(_clean_env("RECAPTCHA_API_KEY"))
    return bool(_clean_env("CAPTCHA_SECRET"))


async def _verify_enterprise(token: str, action: str | None, remote_ip: str | None) -> bool:
    project = _clean_env("RECAPTCHA_PROJECT_ID") or "parvagas"
    api_key = _clean_env("RECAPTCHA_API_KEY")
    site_key = _clean_env("RECAPTCHA_SITE_KEY") or DEFAULT_SITE_KEY
    try:
        threshold = float(_clean_env("RECAPTCHA_SCORE_THRESHOLD") or "0.5")
    except ValueError:
        logger.warning("RECAPTCHA_SCORE_THRESHOLD is not a number; defaulting to 0.5")
        threshold = 0.5
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
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(url, json={"event": event})
        if resp.status_code != 200:
            # WARNING (not INFO): surfaces config errors — bad API key, wrong
            # project id, reCAPTCHA Enterprise API not enabled, etc.
            logger.warning(
                "reCAPTCHA Enterprise HTTP %s (project=%s, siteKey=%s…): %s",
                resp.status_code, project, site_key[:12], resp.text[:300],
            )
            return False
        data = resp.json()
        token_props = data.get("tokenProperties", {})
        if not token_props.get("valid"):
            # The #1 cause here is a frontend/backend SITE KEY MISMATCH
            # (invalidReason == "INVALID_REASON_UNSPECIFIED" or "MALFORMED").
            logger.warning(
                "reCAPTCHA token invalid (reason=%s). Check that backend "
                "RECAPTCHA_SITE_KEY (%s…) matches the frontend "
                "NEXT_PUBLIC_RECAPTCHA_SITE_KEY.",
                token_props.get("invalidReason"), site_key[:12],
            )
            return False
        if action and token_props.get("action") and token_props["action"] != action:
            logger.warning("reCAPTCHA action mismatch: %s != %s", token_props.get("action"), action)
            return False
        score = float(data.get("riskAnalysis", {}).get("score", 0.0))
        if score < threshold:
            logger.warning("reCAPTCHA score %.2f below threshold %.2f", score, threshold)
            return False
        return True
    except Exception as exc:  # pragma: no cover - network/defensive
        logger.warning("reCAPTCHA Enterprise verify failed: %s", exc)
        return False


async def _verify_siteverify(token: str, remote_ip: str | None) -> bool:
    secret = _clean_env("CAPTCHA_SECRET")
    url = _SITEVERIFY_URLS.get(_provider())
    if not secret or not url:
        return True
    try:
        import httpx

        data = {"secret": secret, "response": token}
        if remote_ip:
            data["remoteip"] = remote_ip
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(url, data=data)
        return bool(resp.json().get("success")) if resp.status_code == 200 else False
    except Exception as exc:  # pragma: no cover
        logger.warning("CAPTCHA verify failed: %s", exc)
        return False


def _fail_open() -> bool:
    """Escape hatch: when true, a failed captcha is logged but ALLOWED.

    Use only while reCAPTCHA Enterprise config is being set up (key/project/
    domain). Keep false in steady state. Default false (fail closed).
    """
    return _clean_env("CAPTCHA_FAIL_OPEN", "false").lower() == "true"


async def verify_captcha(token: str | None, action: str | None = None, remote_ip: str | None = None) -> bool:
    """Return True if the captcha passes (or isn't enforced).

    Async so the verification HTTP call never blocks the event loop — keeps the
    auth endpoints scalable under concurrent load.
    """
    if not captcha_required():
        return True
    if not token:
        if _fail_open():
            logger.warning("captcha: no token but CAPTCHA_FAIL_OPEN=true — allowing (action=%s)", action)
            return True
        logger.warning("captcha: request rejected — no x-captcha-token header (action=%s)", action)
        return False

    if _provider() == "recaptcha_enterprise":
        ok = await _verify_enterprise(token, action, remote_ip)
    else:
        ok = await _verify_siteverify(token, remote_ip)

    if not ok and _fail_open():
        logger.warning("captcha: verification failed but CAPTCHA_FAIL_OPEN=true — allowing (action=%s)", action)
        return True
    return ok
