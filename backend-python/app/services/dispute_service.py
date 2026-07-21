"""Payment-dispute state machine and canned response templates — Wave D,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. Implements fluxo-resolucao-disputas.md
(the SOP) and modelo-resposta-disputa.md (Modelo A-F canned templates)
exactly — see those two internal legal documents for the human-readable
policy this code enforces.

State machine: open -> under_review -> (responded <-> under_review) ->
resolved | refunded | rejected. A dispute filed against a transaction is
always attached to the transaction and the user who filed it; only that
user's own paid transactions can be disputed (enforced by the API layer).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from html import escape
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    CandidateCVSubscription, CandidateProfile, Company, PaymentDispute, PaymentDisputeMessage, Transaction, User,
)

settings = get_settings()

CATEGORIES = [
    {"key": "billing_error", "label": "Erro de cobrança (cobrança duplicada ou valor incorreto)"},
    {"key": "service_unavailable", "label": "Serviço não prestado / indisponibilidade"},
    {"key": "refund_request", "label": "Pedido de reembolso dentro do prazo de resolução"},
    {"key": "unrecognized_charge", "label": "Não reconheço esta cobrança"},
    {"key": "dissatisfaction", "label": "Insatisfação com o serviço"},
    {"key": "other", "label": "Outro motivo"},
]
_VALID_CATEGORIES = {c["key"] for c in CATEGORIES}


def _resolve_transaction_party(db: Session, tx: Transaction) -> tuple[User | None, str, str]:
    """(user, party_name, portal_path) for a transaction — the company
    owner for a company transaction, or the candidate for a CV Builder one."""
    if tx.company_id:
        company = db.query(Company).filter(Company.id == tx.company_id).first()
        owner = db.query(User).filter(User.id == company.owner_user_id).first() if company and company.owner_user_id else None
        return owner, (company.name if company else ""), "/Portal/Empresa/Planos"
    sub = db.query(CandidateCVSubscription).filter(CandidateCVSubscription.transaction_reference == tx.reference).first()
    if sub:
        profile = db.query(CandidateProfile).filter(CandidateProfile.id == sub.candidate_profile_id).first()
        user = db.query(User).filter(User.id == profile.user_id).first() if profile else None
        return user, (user.full_name if user else ""), "/Portal/Candidato/CV-e-Documentos"
    return None, "", "/"


def _fmt_date(dt: datetime | None) -> str:
    return dt.strftime("%d/%m/%Y") if dt else ""


def _p(text: str) -> str:
    return f'<p style="margin:0 0 14px;">{text}</p>'


def render_template(code: str, *, dispute: PaymentDispute, tx: Transaction, party_name: str, **extra: Any) -> tuple[str, str, str]:
    """Returns (subject, title, body_html) for one of the six canned
    templates (Modelo A-F, modelo-resposta-disputa.md). `extra` supplies the
    template-specific fields the SOP names in double braces."""
    ref = escape(tx.reference or "")
    amount = f"{tx.amount:,.2f} {escape(tx.currency)}"
    name = escape(party_name or "")

    if code == "A":
        subject = f"Recebemos a sua reclamação sobre a transação {tx.reference}"
        title = "Recebemos a sua reclamação"
        body = (
            _p(f"Olá {name},")
            + _p(f"Confirmamos a receção do seu pedido relativo à transação <strong>{ref}</strong>, no valor de <strong>{amount}</strong>, submetida a {_fmt_date(tx.created_at)}.")
            + _p(f"Motivo indicado: {escape(dispute.reason or '')}")
            + _p("A nossa equipa vai analisar o caso e voltaremos a contactá-lo no prazo máximo de <strong>5 dias úteis</strong> com uma decisão ou com um pedido de informação adicional. Pode acompanhar o estado deste pedido a qualquer momento na sua conta.")
        )
        return subject, title, body

    if code == "B":
        subject = f"Precisamos de mais informação sobre a sua reclamação {tx.reference}"
        title = "Precisamos de mais informação"
        docs = escape(str(extra.get("documents_requested", "")))
        body = (
            _p(f"Olá {name},")
            + _p(f"Para prosseguirmos com a análise da sua reclamação sobre a transação {ref}, agradecemos que nos envie:")
            + _p(docs)
            + _p("Pode responder diretamente a este email ou anexar os documentos na sua conta. Assim que recebermos a informação, retomamos a análise dentro de 3 dias úteis.")
        )
        return subject, title, body

    if code == "C":
        subject = "A sua reclamação foi resolvida — reembolso processado"
        title = "Reembolso processado"
        summary = escape(str(extra.get("summary", "")))
        refunded = f"{extra.get('refund_amount', tx.amount):,.2f} {escape(tx.currency)}"
        access_note = escape(str(extra.get("access_note", "")))
        body = (
            _p(f"Olá {name},")
            + _p(f"Analisámos a sua reclamação sobre a transação {ref} e confirmámos: {summary}.")
            + _p(f"Foi processado um reembolso total de <strong>{refunded}</strong>, através de {escape(tx.provider)}. O prazo estimado de receção é de até 10 dias úteis.")
            + (_p(access_note) if access_note else "")
            + _p("Pedimos desculpa pelo incómodo causado.")
        )
        return subject, title, body

    if code == "D":
        subject = "A sua reclamação foi resolvida — reembolso parcial processado"
        title = "Reembolso parcial processado"
        justification = escape(str(extra.get("justification", "")))
        refunded = f"{extra.get('refund_amount', 0):,.2f} {escape(tx.currency)}"
        body = (
            _p(f"Olá {name},")
            + _p(f"Analisámos a sua reclamação sobre a transação {ref}. Foi processado um reembolso parcial de <strong>{refunded}</strong> (de um total de {amount}), através de {escape(tx.provider)}.")
            + (_p(justification) if justification else "")
            + _p("Se tiver questões adicionais sobre esta decisão, pode responder diretamente a este email.")
        )
        return subject, title, body

    if code == "E":
        subject = f"Resposta à sua reclamação sobre a transação {tx.reference}"
        title = "Resposta à sua reclamação"
        rejection_reason = escape(str(extra.get("rejection_reason", "")))
        body = (
            _p(f"Olá {name},")
            + _p(f"Analisámos cuidadosamente a sua reclamação sobre a transação {ref}. Concluímos que {rejection_reason}, nos termos da nossa <a href=\"{_base_url()}/reembolsos\">Política de Reembolsos e Cancelamento</a>.")
            + _p("Não foi por isso possível processar um reembolso neste caso. Se dispuser de informação adicional que não tenha ainda partilhado connosco, pode responder a este email e reabriremos a análise.")
        )
        return subject, title, body

    if code == "F":
        subject = f"Encerramos a sua reclamação {tx.reference} por falta de resposta"
        title = "Reclamação encerrada"
        requested_at = _fmt_date(dispute.info_requested_at)
        body = (
            _p(f"Olá {name},")
            + _p(f"Não recebemos a informação solicitada em {requested_at} sobre a sua reclamação relativa à transação {ref}. Por esse motivo, encerramos o caso nesta data.")
            + _p("Se pretender retomar a análise, pode responder a este email a qualquer momento com a informação em falta e reabriremos o processo.")
        )
        return subject, title, body

    raise ValueError(f"Unknown dispute template code: {code}")


def _base_url() -> str:
    return (settings.FRONTEND_URL or "https://parvagas.pt").rstrip("/")





def _log_and_send(db: Session, dispute: PaymentDispute, *, code: str, subject: str, body_html: str, to_email: str | None, portal_path: str) -> None:
    message = PaymentDisputeMessage(
        id=str(uuid.uuid4()), dispute_id=dispute.id, template_code=code, subject=subject, body=body_html,
    )
    db.add(message)
    db.commit()
    if to_email:
        from app.workers.tasks import send_templated_email
        send_templated_email.delay("send_dispute_message_email", {
            "email": to_email, "subject": subject, "title": subject, "body_html": body_html, "portal_path": portal_path,
        })


def create_dispute(db: Session, *, transaction: Transaction, filed_by: User, category: str, reason: str) -> PaymentDispute:
    if transaction.status not in {"paid", "refunded"}:
        raise ValueError("Só é possível abrir uma disputa sobre uma transação paga")
    category = category if category in _VALID_CATEGORIES else "other"

    dispute = PaymentDispute(
        id=str(uuid.uuid4()), transaction_id=transaction.id, filed_by_user_id=filed_by.id,
        category=category, reason=reason.strip(), status="open",
    )
    db.add(dispute)
    db.commit()
    db.refresh(dispute)

    _, party_name, portal_path = _resolve_transaction_party(db, transaction)
    subject, title, body = render_template("A", dispute=dispute, tx=transaction, party_name=party_name)
    _log_and_send(db, dispute, code="A", subject=subject, body_html=body, to_email=filed_by.email, portal_path=portal_path)
    return dispute


def assign_to_admin(db: Session, dispute: PaymentDispute, admin: User) -> PaymentDispute:
    dispute.assigned_admin_user_id = admin.id
    if dispute.status == "open":
        dispute.status = "under_review"
    db.commit()
    db.refresh(dispute)
    return dispute


def request_info(db: Session, dispute: PaymentDispute, *, documents_requested: str) -> PaymentDispute:
    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).first()
    user, party_name, portal_path = _resolve_transaction_party(db, tx)
    dispute.status = "responded"
    dispute.info_requested_at = datetime.utcnow()
    db.commit()
    db.refresh(dispute)

    subject, title, body = render_template("B", dispute=dispute, tx=tx, party_name=party_name, documents_requested=documents_requested)
    _log_and_send(db, dispute, code="B", subject=subject, body_html=body, to_email=user.email if user else None, portal_path=portal_path)
    return dispute


def resolve_no_refund(db: Session, dispute: PaymentDispute, *, admin: User, decision_note: str) -> PaymentDispute:
    """The SOP defines this outcome (state table row "resolved" — no value
    change, e.g. a clarification the user accepted) but doesn't assign it a
    lettered Modelo the way it does for refund/reject/no-response outcomes
    — this sends a short ad-hoc confirmation instead of a numbered template."""
    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).first()
    user, party_name, portal_path = _resolve_transaction_party(db, tx)
    dispute.status = "resolved"
    dispute.decision_note = decision_note
    dispute.resolved_at = datetime.utcnow()
    dispute.resolved_by_user_id = admin.id
    db.commit()
    db.refresh(dispute)

    subject = f"A sua reclamação sobre a transação {tx.reference} foi resolvida"
    body = (
        _p(f"Olá {escape(party_name or '')},")
        + _p(f"Analisámos a sua reclamação sobre a transação {escape(tx.reference or '')}. {escape(decision_note)}")
        + _p("Considerámos o caso resolvido. Se tiver questões adicionais, pode responder a este email.")
    )
    _log_and_send(db, dispute, code=None, subject=subject, body_html=body, to_email=user.email if user else None, portal_path=portal_path)
    _check_dispute_rate_threshold(db)
    return dispute


def refund(db: Session, dispute: PaymentDispute, *, admin: User, refund_amount: float, is_partial: bool, summary: str) -> PaymentDispute:
    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).first()
    user, party_name, portal_path = _resolve_transaction_party(db, tx)

    dispute.status = "refunded"
    dispute.refund_amount = refund_amount
    dispute.decision_note = summary
    dispute.resolved_at = datetime.utcnow()
    dispute.resolved_by_user_id = admin.id

    if not is_partial:
        # Full refund — reuse the same access-revocation cascade as the
        # standalone admin refund endpoint (payments stay authoritative on
        # what "refunded" does to a subscription). A partial refund records
        # the outcome on the dispute but deliberately does NOT touch the
        # transaction/subscription — access adjustment for a partial refund
        # is a judgment call left to the admin, not automated here.
        from app.services.receipt_service import revoke_access_for_refunded_transaction
        tx.status = "refunded"
        tx.refunded_at = datetime.utcnow()
        tx.refund_reference = f"DISPUTE-{dispute.id[:8].upper()}"
        revoke_access_for_refunded_transaction(db, tx)

    db.commit()
    db.refresh(dispute)

    code = "C" if not is_partial else "D"
    subject, title, body = render_template(
        code, dispute=dispute, tx=tx, party_name=party_name,
        refund_amount=refund_amount, summary=summary, justification=summary,
    )
    _log_and_send(db, dispute, code=code, subject=subject, body_html=body, to_email=user.email if user else None, portal_path=portal_path)
    _check_dispute_rate_threshold(db)
    return dispute


def reject(db: Session, dispute: PaymentDispute, *, admin: User, rejection_reason: str) -> PaymentDispute:
    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).first()
    user, party_name, portal_path = _resolve_transaction_party(db, tx)
    dispute.status = "rejected"
    dispute.decision_note = rejection_reason
    dispute.resolved_at = datetime.utcnow()
    dispute.resolved_by_user_id = admin.id
    db.commit()
    db.refresh(dispute)

    subject, title, body = render_template("E", dispute=dispute, tx=tx, party_name=party_name, rejection_reason=rejection_reason)
    _log_and_send(db, dispute, code="E", subject=subject, body_html=body, to_email=user.email if user else None, portal_path=portal_path)
    _check_dispute_rate_threshold(db)
    return dispute


def close_no_response(db: Session, dispute: PaymentDispute, *, admin: User) -> PaymentDispute:
    tx = db.query(Transaction).filter(Transaction.id == dispute.transaction_id).first()
    user, party_name, portal_path = _resolve_transaction_party(db, tx)
    dispute.status = "rejected"
    dispute.decision_note = "Encerrado por falta de resposta do utilizador."
    dispute.resolved_at = datetime.utcnow()
    dispute.resolved_by_user_id = admin.id
    db.commit()
    db.refresh(dispute)

    subject, title, body = render_template("F", dispute=dispute, tx=tx, party_name=party_name)
    _log_and_send(db, dispute, code="F", subject=subject, body_html=body, to_email=user.email if user else None, portal_path=portal_path)
    _check_dispute_rate_threshold(db)
    return dispute


def add_internal_note(db: Session, dispute: PaymentDispute, *, admin: User, note: str) -> PaymentDisputeMessage:
    message = PaymentDisputeMessage(
        id=str(uuid.uuid4()), dispute_id=dispute.id, is_internal_note=True,
        body=note, sent_by_user_id=admin.id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_disputes(db: Session, *, status_filter: str | None = None, user_id: str | None = None) -> list[PaymentDispute]:
    query = db.query(PaymentDispute)
    if status_filter:
        query = query.filter(PaymentDispute.status == status_filter)
    if user_id:
        query = query.filter(PaymentDispute.filed_by_user_id == user_id)
    return query.order_by(PaymentDispute.created_at.desc()).all()


def get_dispute(db: Session, dispute_id: str) -> PaymentDispute | None:
    return db.query(PaymentDispute).filter(PaymentDispute.id == dispute_id).first()


def list_messages(db: Session, dispute_id: str) -> list[PaymentDisputeMessage]:
    return (
        db.query(PaymentDisputeMessage)
        .filter(PaymentDisputeMessage.dispute_id == dispute_id)
        .order_by(PaymentDisputeMessage.created_at.asc())
        .all()
    )


def compute_dispute_rate(db: Session) -> dict[str, Any]:
    """Resolved disputes as a share of paid transactions in the trailing
    DISPUTE_RATE_WINDOW_DAYS window — the same metric the Section 7
    threshold alert watches, exposed for display (admin compliance
    dashboard, Wave X4) independent of whether it's actually crossed the
    alert threshold."""
    window_start = datetime.utcnow() - timedelta(days=settings.DISPUTE_RATE_WINDOW_DAYS)
    paid_count = (
        db.query(Transaction)
        .filter(Transaction.status.in_(["paid", "refunded"]), Transaction.created_at >= window_start)
        .count()
    )
    resolved_disputes = (
        db.query(PaymentDispute)
        .filter(PaymentDispute.resolved_at.isnot(None), PaymentDispute.resolved_at >= window_start)
        .count()
    )
    rate = (resolved_disputes / paid_count) if paid_count else 0.0
    return {
        "rate": rate,
        "resolvedDisputes": resolved_disputes,
        "paidTransactions": paid_count,
        "windowDays": settings.DISPUTE_RATE_WINDOW_DAYS,
        "aboveThreshold": paid_count >= settings.DISPUTE_RATE_MIN_TRANSACTIONS and rate >= settings.DISPUTE_RATE_ALERT_THRESHOLD,
    }


def _check_dispute_rate_threshold(db: Session) -> None:
    """fluxo-resolucao-disputas.md Section 7: an abnormally high dispute
    rate is a possible fraud/security incident, escalated the same way as a
    login burst — reuses security_service's alert + cooldown machinery so
    dispute-rate alerts land in the same admin inbox/tab as other security
    alerts, deduplicated the same way."""
    try:
        summary = compute_dispute_rate(db)
        paid_count = summary["paidTransactions"]
        resolved_disputes = summary["resolvedDisputes"]
        rate = summary["rate"]
        if paid_count < settings.DISPUTE_RATE_MIN_TRANSACTIONS:
            return
        if rate < settings.DISPUTE_RATE_ALERT_THRESHOLD:
            return

        from app.services import security_service
        key = f"window-{settings.DISPUTE_RATE_WINDOW_DAYS}d"
        if security_service._alert_recently_sent(db, event_type="dispute_rate_threshold", key=key):
            return
        security_service.record_security_event(
            db, event_type="dispute_rate_threshold", severity="high",
            details={"rate": round(rate, 4), "disputes": resolved_disputes, "transactions": paid_count},
        )
        security_service._send_alert(
            db, alert_for="dispute_rate_threshold", alert_key=key,
            subject="Parvagas — Taxa de disputas de pagamento acima do limiar",
            title="Taxa de disputas elevada",
            lines=[
                f"{resolved_disputes} disputas resolvidas em {paid_count} transações pagas nos últimos {settings.DISPUTE_RATE_WINDOW_DAYS} dias ({rate:.1%}).",
                f"Limiar configurado: {settings.DISPUTE_RATE_ALERT_THRESHOLD:.1%}.",
                "Uma taxa de disputas anormalmente elevada pode indicar fraude ou um problema sistémico — reveja a fila de disputas no admin.",
            ],
        )
    except Exception:  # noqa: BLE001 — never break a dispute resolution over alerting
        pass
