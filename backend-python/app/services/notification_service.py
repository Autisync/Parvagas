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


# NOTE: SMS/WhatsApp gateway integrations are ARCHIVED for now (deferred).
# The Twilio + Africa's Talking implementations live in git history (commit
# 308dd26) and can be restored when the feature is reprioritised. Until then
# these are safe no-ops that just log, so callers (OTP, notifications) never break.


def send_sms(to: str, message: str) -> dict:
    """Send an SMS. ARCHIVED — logs only; returns a delivery descriptor."""
    logger.info("[SMS:archived] to=%s msg=%s", to, message)
    return {"status": "logged", "provider": "archived", "to": to}


def send_whatsapp(to: str, message: str) -> dict:
    """Send a WhatsApp message. ARCHIVED — logs only."""
    logger.info("[WhatsApp:archived] to=%s msg=%s", to, message)
    return {"status": "logged", "provider": "archived", "to": to}


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


def admin_user_ids(db) -> list[str]:
    """Every admin User row's id — for in-app bell notifications, which
    (unlike admin_emails) can only ever reach real portal accounts, so the
    ADMIN_ALERT_EMAILS env override (external addresses) doesn't apply here."""
    try:
        from app.models import User, UserRole

        rows = db.query(User).filter(User.role == UserRole.admin).all()
        return [u.id for u in rows]
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("admin_user_ids lookup failed: %s", exc)
        return []


def notify_admins(db, *, type: str, title: str, body: str = "", link: str = "") -> None:
    """create_notification for every admin at once — the in-app companion
    to admin_emails-based email alerts."""
    for admin_id in admin_user_ids(db):
        create_notification(db, admin_id, type=type, title=title, body=body, link=link)


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
