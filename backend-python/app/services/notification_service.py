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


def send_sms(to: str, message: str) -> dict:
    """Send an SMS. Returns a delivery descriptor; never raises to callers."""
    try:
        if SMS_PROVIDER == "log":
            logger.info("[SMS:log] to=%s msg=%s", to, message)
            return {"status": "logged", "provider": "log", "to": to}
        # Integration points — wire the chosen provider's SDK/HTTP here.
        # if SMS_PROVIDER == "twilio": ...
        # if SMS_PROVIDER == "africastalking": ...
        logger.warning("SMS provider '%s' not implemented; message dropped", SMS_PROVIDER)
        return {"status": "unconfigured", "provider": SMS_PROVIDER, "to": to}
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("send_sms failed: %s", exc)
        return {"status": "error", "provider": SMS_PROVIDER, "to": to}


def send_whatsapp(to: str, message: str) -> dict:
    """Send a WhatsApp message (dominant channel in-market)."""
    try:
        if WHATSAPP_PROVIDER == "log":
            logger.info("[WhatsApp:log] to=%s msg=%s", to, message)
            return {"status": "logged", "provider": "log", "to": to}
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
