"""Security event recording + admin alerting.

Added after the 2026-07-09 incident where the no-reply@parvagas.pt SMTP
credential was compromised and used for a spam run. Three responsibilities:

1. record_security_event() — durable row per suspicious occurrence (failed
   login, lockout, email rate-limit hit, ...), with IP + user-agent, shown in
   the admin portal's "Segurança" tab.
2. Burst detection — when the same account OR the same IP accumulates
   SECURITY_FAILED_LOGIN_BURST_THRESHOLD failed logins within
   SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES, a high-severity `login_burst`
   event is recorded and an alert email goes out.
3. Alert dispatch — to SECURITY_ALERT_EMAIL cc SECURITY_ALERT_CC, throttled
   per (event_type, key) by SECURITY_ALERT_COOLDOWN_MINUTES so a sustained
   attack produces one email per cooldown window, not one per attempt. Alert
   emails bypass the outbound rate limit (priority=True) so the alert that
   says "email sending is being abused" cannot itself be suppressed by the
   cap it is reporting on.

Every public function here swallows its own exceptions: security bookkeeping
must never break login or email delivery.
"""
import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import SecurityEvent

logger = get_logger(__name__)
settings = get_settings()


def record_security_event(
    db: Session,
    *,
    event_type: str,
    severity: str = "low",
    email: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
) -> SecurityEvent | None:
    """Persist one security event. Returns the row, or None on failure."""
    try:
        event = SecurityEvent(
            event_type=event_type,
            severity=severity,
            email=(email or "").strip().lower() or None,
            ip_address=(ip_address or "").strip() or None,
            user_agent=(user_agent or "")[:400] or None,
            details=json.dumps(details) if details else None,
        )
        db.add(event)
        db.commit()
        return event
    except Exception as exc:  # noqa: BLE001 — never break the caller
        logger.warning("record_security_event(%s) failed: %s", event_type, exc)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return None


def record_failed_login(
    db: Session,
    *,
    email: str | None,
    ip_address: str | None,
    user_agent: str | None,
    reason: str = "",
) -> None:
    """Record a failed login and run burst detection for the account + IP."""
    try:
        record_security_event(
            db,
            event_type="failed_login",
            severity="low",
            email=email,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"reason": reason[:200]} if reason else None,
        )
        _check_login_burst(db, email=email, ip_address=ip_address)
    except Exception as exc:  # noqa: BLE001
        logger.warning("record_failed_login failed: %s", exc)


def _check_login_burst(db: Session, *, email: str | None, ip_address: str | None) -> None:
    """Alert when one account or one IP racks up too many failures too fast."""
    threshold = settings.SECURITY_FAILED_LOGIN_BURST_THRESHOLD
    if threshold <= 0:
        return
    window_start = datetime.utcnow() - timedelta(
        minutes=settings.SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES
    )

    checks: list[tuple[str, str | None]] = []
    if email:
        checks.append(("email", email.strip().lower()))
    if ip_address:
        checks.append(("ip_address", ip_address.strip()))

    for dimension, value in checks:
        if not value:
            continue
        column = SecurityEvent.email if dimension == "email" else SecurityEvent.ip_address
        count = (
            db.query(SecurityEvent)
            .filter(
                SecurityEvent.event_type == "failed_login",
                column == value,
                SecurityEvent.created_at >= window_start,
            )
            .count()
        )
        if count < threshold:
            continue
        if _alert_recently_sent(db, event_type="login_burst", key=value):
            continue

        record_security_event(
            db,
            event_type="login_burst",
            severity="high",
            email=value if dimension == "email" else None,
            ip_address=value if dimension == "ip_address" else None,
            details={
                "dimension": dimension,
                "failedAttempts": count,
                "windowMinutes": settings.SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES,
            },
        )
        _send_alert(
            db,
            alert_for="login_burst",
            alert_key=value,
            subject="Alerta de segurança — tentativas de login falhadas",
            title="Possível ataque de força bruta",
            lines=[
                f"Foram detetadas {count} tentativas de login falhadas nos últimos "
                f"{settings.SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES} minutos.",
                f"{'Conta visada' if dimension == 'email' else 'Endereço IP de origem'}: {value}",
                "Reveja o separador Segurança no portal de administração para o detalhe "
                "(IPs, user-agents e horários de cada tentativa).",
            ],
        )


def record_email_rate_limit_hit(*, sent_this_hour: int, blocked_recipient: str) -> None:
    """Called by EmailService when the hourly outbound cap trips.

    Opens its own DB session — EmailService has no request-scoped session.
    """
    try:
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            record_security_event(
                db,
                event_type="email_rate_limit",
                severity="high",
                details={
                    "sentThisHour": sent_this_hour,
                    "limit": settings.EMAIL_MAX_PER_HOUR,
                    "blockedRecipient": blocked_recipient[:120],
                },
            )
            if not _alert_recently_sent(db, event_type="email_rate_limit", key="global"):
                _send_alert(
                    db,
                    alert_for="email_rate_limit",
                    alert_key="global",
                    subject="Alerta de segurança — limite de envio de emails atingido",
                    title="Envio de emails bloqueado pelo limite horário",
                    lines=[
                        f"O backend atingiu o limite de {settings.EMAIL_MAX_PER_HOUR} emails/hora "
                        f"({sent_this_hour} enviados nesta hora) e os envios seguintes foram bloqueados.",
                        "Se isto não corresponde a tráfego legítimo, pode indicar credenciais "
                        "comprometidas ou um ciclo de envio descontrolado.",
                        "Reveja o separador Segurança no portal de administração e o histórico "
                        "do Rspamd no servidor de email.",
                    ],
                )
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning("record_email_rate_limit_hit failed: %s", exc)


def _alert_recently_sent(db: Session, *, event_type: str, key: str) -> bool:
    """True if an alert for this (event_type, key) went out within the cooldown."""
    try:
        cooldown_start = datetime.utcnow() - timedelta(
            minutes=settings.SECURITY_ALERT_COOLDOWN_MINUTES
        )
        recent = (
            db.query(SecurityEvent)
            .filter(
                SecurityEvent.event_type == "alert_sent",
                SecurityEvent.created_at >= cooldown_start,
            )
            .order_by(SecurityEvent.created_at.desc())
            .limit(50)
            .all()
        )
        for row in recent:
            try:
                info = json.loads(row.details or "{}")
            except Exception:  # noqa: BLE001
                continue
            if info.get("alertFor") == event_type and info.get("key") == key:
                return True
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("_alert_recently_sent check failed: %s", exc)
        return False  # fail-open: better a duplicate alert than a missed one


def _send_alert(db: Session, *, alert_for: str, alert_key: str, subject: str, title: str, lines: list[str]) -> None:
    """Queue the security alert email and record that it went out (for the
    cooldown). Dispatched via Celery, not sent inline — this runs inside the
    /auth/login request path (login() calls record_failed_login() on every
    failed attempt), and send_security_alert_email is a real SMTP round-trip
    (up to EMAIL_SEND_TIMEOUT_SECONDS). Sending it synchronously would (a)
    make the failed request's latency a side-channel telling an attacker
    exactly when they've tripped the burst threshold, and (b) hang the
    gunicorn worker handling that request if mailcow is slow/unreachable —
    every other email in this codebase already goes through Celery
    (workers/tasks.py); this was the one inline exception."""
    try:
        from app.workers.tasks import send_templated_email

        send_templated_email.delay("send_security_alert_email", {"subject": subject, "title": title, "lines": lines})
        record_security_event(
            db,
            event_type="alert_sent",
            severity="medium",
            details={
                "alertFor": alert_for,
                "key": alert_key,
                "queued": True,
                "to": settings.SECURITY_ALERT_EMAIL,
                "cc": settings.SECURITY_ALERT_CC,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("security alert dispatch failed: %s", exc)
