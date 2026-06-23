"""Outbound notification channels (SMS / WhatsApp / push).

Pluggable provider interface. Defaults to a safe "log" provider so the app
works without third-party credentials; configure a real provider (Africa's
Talking, Twilio, Unitel SMS, WhatsApp Cloud API) via env to go live.
"""
from __future__ import annotations

import os

from app.core.logging import get_logger

logger = get_logger(__name__)

SMS_PROVIDER = os.getenv("SMS_PROVIDER", "log")          # log | twilio | africastalking | unitel
WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "log")  # log | meta_cloud | twilio


def _twilio_sms(to: str, message: str) -> dict:
    """Twilio REST API (works for AO numbers in E.164, e.g. +2449...)."""
    import httpx

    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    sender = os.getenv("TWILIO_FROM", "")
    if not (sid and token and sender):
        return {"status": "unconfigured", "provider": "twilio", "to": to}
    resp = httpx.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data={"To": to, "From": sender, "Body": message},
        auth=(sid, token), timeout=12,
    )
    ok = resp.status_code in (200, 201)
    if not ok:
        logger.warning("Twilio SMS %s: %s", resp.status_code, resp.text[:200])
    return {"status": "sent" if ok else "error", "provider": "twilio", "to": to}


def _africastalking_sms(to: str, message: str) -> dict:
    """Africa's Talking SMS API (strong AO/SSA coverage)."""
    import httpx

    username = os.getenv("AT_USERNAME", "")
    api_key = os.getenv("AT_API_KEY", "")
    sender = os.getenv("AT_SENDER_ID", "")
    if not (username and api_key):
        return {"status": "unconfigured", "provider": "africastalking", "to": to}
    data = {"username": username, "to": to, "message": message}
    if sender:
        data["from"] = sender
    resp = httpx.post(
        "https://api.africastalking.com/version1/messaging",
        data=data,
        headers={"apiKey": api_key, "Accept": "application/json",
                 "Content-Type": "application/x-www-form-urlencoded"},
        timeout=12,
    )
    ok = resp.status_code in (200, 201)
    if not ok:
        logger.warning("Africa's Talking SMS %s: %s", resp.status_code, resp.text[:200])
    return {"status": "sent" if ok else "error", "provider": "africastalking", "to": to}


def send_sms(to: str, message: str) -> dict:
    """Send an SMS. Returns a delivery descriptor; never raises to callers."""
    try:
        if SMS_PROVIDER == "log":
            logger.info("[SMS:log] to=%s msg=%s", to, message)
            return {"status": "logged", "provider": "log", "to": to}
        if SMS_PROVIDER == "twilio":
            return _twilio_sms(to, message)
        if SMS_PROVIDER in ("africastalking", "africas_talking", "at"):
            return _africastalking_sms(to, message)
        logger.warning("SMS provider '%s' not implemented; message dropped", SMS_PROVIDER)
        return {"status": "unconfigured", "provider": SMS_PROVIDER, "to": to}
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("send_sms failed: %s", exc)
        return {"status": "error", "provider": SMS_PROVIDER, "to": to}


def _twilio_whatsapp(to: str, message: str) -> dict:
    import httpx

    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    sender = os.getenv("TWILIO_WHATSAPP_FROM", "")  # e.g. "whatsapp:+14155238886"
    if not (sid and token and sender):
        return {"status": "unconfigured", "provider": "twilio", "to": to}
    dest = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    resp = httpx.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data={"To": dest, "From": sender, "Body": message},
        auth=(sid, token), timeout=12,
    )
    ok = resp.status_code in (200, 201)
    if not ok:
        logger.warning("Twilio WhatsApp %s: %s", resp.status_code, resp.text[:200])
    return {"status": "sent" if ok else "error", "provider": "twilio", "to": to}


def send_whatsapp(to: str, message: str) -> dict:
    """Send a WhatsApp message (dominant channel in-market)."""
    try:
        if WHATSAPP_PROVIDER == "log":
            logger.info("[WhatsApp:log] to=%s msg=%s", to, message)
            return {"status": "logged", "provider": "log", "to": to}
        if WHATSAPP_PROVIDER in ("twilio", "meta_cloud"):
            # Meta Cloud API support can slot in here; Twilio covered now.
            if WHATSAPP_PROVIDER == "twilio":
                return _twilio_whatsapp(to, message)
        logger.warning("WhatsApp provider '%s' not implemented; message dropped", WHATSAPP_PROVIDER)
        return {"status": "unconfigured", "provider": WHATSAPP_PROVIDER, "to": to}
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("send_whatsapp failed: %s", exc)
        return {"status": "error", "provider": WHATSAPP_PROVIDER, "to": to}


def create_notification(db, user_id: str, *, type: str, title: str, body: str = "", link: str = "") -> None:
    """Create an in-app notification (portal bell). Best-effort — never raises."""
    if not user_id:
        return
    try:
        from app.models import Notification

        db.add(Notification(user_id=user_id, type=type, title=title, body=body or None, link=link or None))
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("create_notification failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


def admin_emails(db) -> list[str]:
    """Recipient list for admin alerts.

    ADMIN_ALERT_EMAILS (comma-separated) overrides; otherwise every admin user.
    """
    override = os.getenv("ADMIN_ALERT_EMAILS", "").strip()
    if override:
        return [e.strip() for e in override.split(",") if e.strip()]
    try:
        from app.models import User, UserRole

        rows = db.query(User).filter(User.role == UserRole.admin).all()
        return [u.email for u in rows if getattr(u, "email", None)]
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("admin_emails lookup failed: %s", exc)
        return []
