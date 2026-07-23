"""Monetization: employer plans, subscriptions, and local-rail payments.

Default flow is a manual bank/Multicaixa reference: the employer subscribes →
a pending Transaction with a payment reference is created → an admin (or a
provider webhook) confirms it → the subscription activates. Real providers
(Multicaixa Express, Unitel Money) plug into `confirm_payment`.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import (
    CandidateCVSubscription, CandidateProfile,
    Company, Plan, Subscription, Transaction, User, UserRole,
)
from app.workers.tasks import send_templated_email
from app.core.logging import get_logger
from app.services.candidate_billing_service import get_cv_builder_plans
from app.services import receipt_service
from app.services.company_access_service import resolve_company_for_user, require_role

logger = get_logger(__name__)

router = APIRouter(tags=["payments"])

# Seed catalogue used when no plans exist in the DB yet (Angola pricing, AOA).
# max_active_jobs mirrors migrations/versions/20260721_0062_plan_max_active_jobs.py's
# backfill — keep the two in sync (-1 = unlimited).
_DEFAULT_PLANS = [
    {"code": "free", "name": "Grátis", "price": 0, "interval": "month",
     "features": ["1 vaga ativa", "Candidaturas ilimitadas"], "max_active_jobs": 1},
    {"code": "starter", "name": "Starter", "price": 25000, "interval": "month",
     "features": ["5 vagas ativas", "Destaque básico", "Suporte por email"], "max_active_jobs": 5},
    {"code": "business", "name": "Business", "price": 75000, "interval": "month",
     "features": ["Vagas ilimitadas", "Vagas em destaque", "Acesso à base de CVs", "Analytics"], "max_active_jobs": -1},
    {"code": "featured_post", "name": "Vaga em Destaque", "price": 15000, "interval": "one_time",
     "features": ["1 vaga destacada por 30 dias"], "max_active_jobs": -1},
]


def _serialize_plan(p: Plan) -> dict[str, Any]:
    return {
        "_id": p.id, "code": p.code, "name": p.name, "price": p.price,
        "currency": p.currency, "interval": p.interval,
        "features": json.loads(p.features) if p.features else [],
    }


def _ensure_seed_plans(db: Session) -> list[Plan]:
    plans = db.query(Plan).filter(Plan.active.is_(True)).all()
    if plans:
        return plans
    for d in _DEFAULT_PLANS:
        db.add(Plan(code=d["code"], name=d["name"], price=d["price"], currency="AOA",
                    interval=d["interval"], features=json.dumps(d["features"], ensure_ascii=True), active=True,
                    max_active_jobs=d["max_active_jobs"]))
    db.commit()
    return db.query(Plan).filter(Plan.active.is_(True)).all()


@router.get("/plans")
async def list_plans(db: Session = Depends(get_db)):
    """Public plan catalogue."""
    return {"plans": [_serialize_plan(p) for p in _ensure_seed_plans(db)]}


def _company_for(db: Session, user: User) -> Company:
    """Owner or invited team member — see company_access_service for why
    owner-only used to 404 every team member. Billing-mutation endpoints
    (subscribe/cancel/confirm) may eventually want owner-only enforcement
    on top of this; tracked separately."""
    return resolve_company_for_user(db, user)


@router.get("/companies/subscription")
async def my_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    co = _company_for(db, current_user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.company_id == co.id)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not sub:
        return {"subscription": None}
    plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
    return {"subscription": {
        "_id": sub.id, "status": sub.status,
        "plan": _serialize_plan(plan) if plan else None,
        "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancelRequestedAt": sub.cancel_requested_at.isoformat() if sub.cancel_requested_at else None,
    }}


@router.post("/companies/subscription/cancel")
async def cancel_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Cancels future renewal only — access continues until current_period_end
    and nothing is refunded for the period already in progress
    (reembolsos.md Section 3). Idempotent. Owner only."""
    co = _company_for(db, current_user)
    require_role(db, current_user, co, {"owner"})
    sub = (
        db.query(Subscription)
        .filter(Subscription.company_id == co.id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma subscrição ativa encontrada")
    if not sub.cancel_requested_at:
        sub.cancel_requested_at = datetime.utcnow()
        db.commit()
        db.refresh(sub)
    return {
        "subscription": {
            "_id": sub.id, "status": sub.status,
            "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "cancelRequestedAt": sub.cancel_requested_at.isoformat(),
        }
    }


@router.post("/companies/subscription/resume")
async def resume_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Undoes a pending cancellation while the current period hasn't ended yet.
    Owner only."""
    co = _company_for(db, current_user)
    require_role(db, current_user, co, {"owner"})
    sub = (
        db.query(Subscription)
        .filter(Subscription.company_id == co.id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma subscrição ativa encontrada")
    sub.cancel_requested_at = None
    db.commit()
    return {"subscription": {"_id": sub.id, "status": sub.status, "cancelRequestedAt": None}}


@router.post("/companies/subscribe")
async def subscribe(payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a pending subscription + a payment reference for a local rail.
    Owner only."""
    co = _company_for(db, current_user)
    require_role(db, current_user, co, {"owner"})
    _ensure_seed_plans(db)
    plan = db.query(Plan).filter(Plan.code == str(payload.get("planCode", "")).strip()).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plano inválido")
    provider = str(payload.get("provider", "manual")).strip().lower()
    if provider not in {"manual", "multicaixa", "unitel_money", "bank"}:
        provider = "manual"

    reference = f"PV-{uuid.uuid4().hex[:10].upper()}"
    sub = Subscription(company_id=co.id, plan_id=plan.id, status="pending")
    db.add(sub)
    tx = Transaction(
        company_id=co.id, plan_id=plan.id, amount=plan.price, currency=plan.currency,
        provider=provider, reference=reference, status="pending",
        kind="subscription" if plan.interval == "month" else "post",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    # If free plan, activate immediately.
    if plan.price == 0:
        return _activate(db, tx)

    # Paid plan: email the owner the payment instructions.
    try:
        owner = db.query(User).filter(User.id == co.owner_user_id).first() if co.owner_user_id else None
        if owner and owner.email:
            send_templated_email.delay("send_payment_instructions_email", {
                "email": owner.email, "company_name": co.name, "plan_name": plan.name,
                "amount": plan.price, "currency": plan.currency, "reference": reference,
            })
    except Exception as e:
        logger.warning(f"Could not enqueue payment instructions email: {e}")

    return {
        "transaction": {"_id": tx.id, "reference": reference, "amount": tx.amount,
                        "currency": tx.currency, "provider": provider, "status": "pending"},
        "instructions": _payment_instructions(provider, reference, plan),
    }


def _payment_instructions(provider: str, reference: str, plan: Plan) -> dict[str, Any]:
    base = {"reference": reference, "amount": plan.price, "currency": plan.currency}
    if provider == "multicaixa":
        base["message"] = f"Pague {plan.price} {plan.currency} via Multicaixa Express usando a referência {reference}."
    elif provider == "unitel_money":
        base["message"] = f"Pague {plan.price} {plan.currency} via Unitel Money para a conta Parvagas, referência {reference}."
    else:
        base["message"] = f"Transfira {plan.price} {plan.currency} e indique a referência {reference}. A conta ativa após confirmação."
    return base


def _activate(db: Session, tx: Transaction) -> dict[str, Any]:
    tx.status = "paid"
    db.commit()
    receipt_service.assign_receipt_number(db, tx)
    sub = (
        db.query(Subscription)
        .filter(Subscription.company_id == tx.company_id, Subscription.plan_id == tx.plan_id, Subscription.status == "pending")
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if sub:
        sub.status = "active"
        sub.current_period_end = datetime.utcnow() + timedelta(days=30)
    db.commit()

    # Receipt / activation email to the company owner.
    try:
        company = db.query(Company).filter(Company.id == tx.company_id).first()
        owner = db.query(User).filter(User.id == company.owner_user_id).first() if company and company.owner_user_id else None
        plan = db.query(Plan).filter(Plan.id == tx.plan_id).first()
        if owner and owner.email:
            period_end = sub.current_period_end.strftime("%d/%m/%Y") if sub and sub.current_period_end else ""
            send_templated_email.delay("send_subscription_activated_email", {
                "email": owner.email,
                "company_name": company.name if company else "",
                "plan_name": plan.name if plan else "",
                "period_end": period_end,
            })
    except Exception as e:
        logger.warning(f"Could not enqueue subscription activated email: {e}")

    return {"transaction": {"_id": tx.id, "reference": tx.reference, "status": tx.status}, "activated": True}


@router.post("/payments/{reference}/confirm")
async def confirm_payment(reference: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Confirm a payment by reference. Admin-only (stands in for a provider webhook)."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transação não encontrada")
    if tx.status == "paid":
        return {"transaction": {"_id": tx.id, "reference": reference, "status": "paid"}, "activated": True}
    return _activate(db, tx)


# ── Candidate CV Builder subscription ──────────────────────────────────────
#
# Plan catalogue (tiers, pricing, limits) lives in the admin-editable
# candidate_cv_plans table (app.services.candidate_billing_service.
# get_cv_builder_plans) — the single source of truth shared with the
# quota/feature checks that gate resume and cover-letter CRUD in
# app.api.v1.resumes, so the pricing page and actual enforcement can never
# drift apart.
#
# Payment flow mirrors the company subscription flow (manual → bank reference →
# admin/webhook confirms → subscription activates).


@router.get("/cv-builder/plans")
async def list_cv_builder_plans(db: Session = Depends(get_db)):
    """Public CV Builder plan catalogue."""
    return {"plans": get_cv_builder_plans(db)}


@router.get("/cv-builder/subscription")
async def my_cv_builder_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the candidate's current CV builder subscription tier."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de candidato não encontrado")

    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id)
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )

    # Default to free if no subscription record yet.
    tier = sub.plan_tier if sub and sub.status == "active" else "free"
    plans = get_cv_builder_plans(db)
    plan_info = next((p for p in plans if p["tier"] == tier), plans[0])

    return {
        "subscription": {
            "_id": sub.id if sub else None,
            "status": sub.status if sub else "active",
            "tier": tier,
            "plan": plan_info,
            "currentPeriodEnd": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
            "cancelRequestedAt": sub.cancel_requested_at.isoformat() if sub and sub.cancel_requested_at else None,
        }
    }


def _candidate_profile_for(db: Session, user: User) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de candidato não encontrado")
    return profile


@router.post("/cv-builder/subscription/cancel")
async def cancel_cv_builder_subscription(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Same cancel-at-period-end semantics as /companies/subscription/cancel
    — the free tier has nothing to cancel."""
    profile = _candidate_profile_for(db, current_user)
    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id, CandidateCVSubscription.status == "active")
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )
    if not sub or sub.plan_tier == "free":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma subscrição paga ativa encontrada")
    if not sub.cancel_requested_at:
        sub.cancel_requested_at = datetime.utcnow()
        db.commit()
        db.refresh(sub)
    return {
        "subscription": {
            "_id": sub.id, "tier": sub.plan_tier, "status": sub.status,
            "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "cancelRequestedAt": sub.cancel_requested_at.isoformat(),
        }
    }


@router.post("/cv-builder/subscription/resume")
async def resume_cv_builder_subscription(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    profile = _candidate_profile_for(db, current_user)
    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id, CandidateCVSubscription.status == "active")
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma subscrição ativa encontrada")
    sub.cancel_requested_at = None
    db.commit()
    return {"subscription": {"_id": sub.id, "tier": sub.plan_tier, "status": sub.status, "cancelRequestedAt": None}}


@router.post("/cv-builder/subscribe")
async def subscribe_cv_builder(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Subscribe a candidate to a CV Builder plan.

    Free tier activates immediately. Paid tiers follow the manual payment-reference
    flow used by company subscriptions.
    """
    tier = str(payload.get("tier", "free")).strip().lower()
    plan_info = next((p for p in get_cv_builder_plans(db) if p["tier"] == tier), None)
    if not plan_info:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plano inválido")

    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de candidato não encontrado")

    provider = str(payload.get("provider", "manual")).strip().lower()
    if provider not in {"manual", "multicaixa", "unitel_money", "bank"}:
        provider = "manual"

    reference = f"PVCV-{uuid.uuid4().hex[:8].upper()}"

    # Cancel any existing active/pending subscription for this candidate.
    existing = (
        db.query(CandidateCVSubscription)
        .filter(
            CandidateCVSubscription.candidate_profile_id == profile.id,
            CandidateCVSubscription.status.in_(["active", "pending"]),
        )
        .all()
    )
    for e in existing:
        e.status = "cancelled"

    sub = CandidateCVSubscription(
        candidate_profile_id=profile.id,
        plan_tier=tier,
        status="pending" if plan_info["price"] > 0 else "active",
        current_period_end=datetime.utcnow() + timedelta(days=30) if plan_info["price"] == 0 else None,
        transaction_reference=reference if plan_info["price"] > 0 else None,
    )
    db.add(sub)

    # Record a transaction for paid plans.
    if plan_info["price"] > 0:
        tx = Transaction(
            amount=plan_info["price"], currency="AOA",
            provider=provider, reference=reference, status="pending",
            kind="subscription",
        )
        db.add(tx)

    db.commit()
    db.refresh(sub)

    if plan_info["price"] == 0:
        return {
            "activated": True,
            "subscription": {"tier": tier, "status": "active"},
        }

    # Paid: send payment instructions email.
    try:
        if current_user.email:
            send_templated_email.delay("send_payment_instructions_email", {
                "email": current_user.email,
                "company_name": current_user.full_name,
                "plan_name": plan_info["name"],
                "amount": plan_info["price"],
                "currency": "AOA",
                "reference": reference,
            })
    except Exception as e:
        logger.warning(f"Could not enqueue CV builder payment email: {e}")

    instr: dict[str, Any] = {"reference": reference, "amount": plan_info["price"], "currency": "AOA"}
    if provider == "multicaixa":
        instr["message"] = f"Pague {plan_info['price']} AOA via Multicaixa Express — referência {reference}."
    elif provider == "unitel_money":
        instr["message"] = f"Pague {plan_info['price']} AOA via Unitel Money — referência {reference}."
    else:
        instr["message"] = f"Transfira {plan_info['price']} AOA e indique a referência {reference}."

    return {
        "activated": False,
        "subscription": {"tier": tier, "status": "pending"},
        "transaction": {"reference": reference, "amount": plan_info["price"], "currency": "AOA"},
        "instructions": instr,
    }


@router.post("/cv-builder/confirm/{reference}")
async def confirm_cv_builder_payment(
    reference: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin confirms a CV builder payment — activates the candidate's subscription."""
    if current_user.role not in (UserRole.admin, UserRole.super_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso de administrador necessário")

    sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.transaction_reference == reference)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscrição não encontrada")

    sub.status = "active"
    sub.current_period_end = datetime.utcnow() + timedelta(days=30)

    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    if tx:
        tx.status = "paid"

    db.commit()
    if tx:
        receipt_service.assign_receipt_number(db, tx)
    return {"activated": True, "tier": sub.plan_tier, "reference": reference}


# ── Self-service receipts (Wave P3) ─────────────────────────────────────────
#
# Scoped to "latest paid transaction" rather than a full billing-history
# list — there is no billing-history UI yet (a future candidate), and this
# covers the real, immediate need: a downloadable receipt for what you just
# paid. Admins can pull any historical transaction's receipt via the
# /admin/transactions surface regardless of this scoping.

def _latest_paid_transaction(db: Session, *, company_id: str | None = None, reference: str | None = None) -> Transaction | None:
    query = db.query(Transaction).filter(Transaction.status.in_(["paid", "refunded"]))
    if company_id:
        query = query.filter(Transaction.company_id == company_id)
    if reference:
        query = query.filter(Transaction.reference == reference)
    return query.order_by(Transaction.created_at.desc()).first()


@router.get("/companies/subscription/receipt")
async def company_subscription_receipt(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    co = _company_for(db, current_user)
    tx = _latest_paid_transaction(db, company_id=co.id)
    if not tx or not tx.receipt_number:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum recibo disponível")
    plan = db.query(Plan).filter(Plan.id == tx.plan_id).first()
    pdf = receipt_service.generate_receipt_pdf(
        tx, party_name=co.name, party_email=current_user.email,
        description=f"Plano {plan.name if plan else ''} — Parvagas",
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="recibo-{tx.receipt_number}.pdf"'},
    )


@router.post("/companies/subscription/dispute")
async def dispute_company_subscription_payment(
    payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Convenience wrapper around dispute_service.create_dispute for the
    most recent paid transaction — mirrors .../receipt above. A user with
    an older transaction to dispute uses the generic POST /account/disputes
    with an explicit transactionReference instead. Owner only."""
    from app.services import dispute_service

    co = _company_for(db, current_user)
    require_role(db, current_user, co, {"owner"})
    tx = _latest_paid_transaction(db, company_id=co.id)
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma transação paga encontrada")
    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reason é obrigatório")
    category = str(payload.get("category", "other")).strip()
    try:
        dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=current_user, category=category, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"dispute": {"id": dispute.id, "status": dispute.status}}


@router.get("/cv-builder/subscription/receipt")
async def cv_builder_subscription_receipt(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    profile = _candidate_profile_for(db, current_user)
    latest_sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id, CandidateCVSubscription.transaction_reference.isnot(None))
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )
    if not latest_sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum recibo disponível")
    tx = _latest_paid_transaction(db, reference=latest_sub.transaction_reference)
    if not tx or not tx.receipt_number:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum recibo disponível")
    plan_info = next((p for p in get_cv_builder_plans(db) if p["tier"] == latest_sub.plan_tier), None)
    pdf = receipt_service.generate_receipt_pdf(
        tx, party_name=current_user.full_name, party_email=current_user.email,
        description=f"Plano {plan_info['name'] if plan_info else latest_sub.plan_tier} — CV Builder Parvagas",
    )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="recibo-{tx.receipt_number}.pdf"'},
    )


@router.post("/cv-builder/subscription/dispute")
async def dispute_cv_builder_subscription_payment(
    payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    from app.services import dispute_service

    profile = _candidate_profile_for(db, current_user)
    latest_sub = (
        db.query(CandidateCVSubscription)
        .filter(CandidateCVSubscription.candidate_profile_id == profile.id, CandidateCVSubscription.transaction_reference.isnot(None))
        .order_by(CandidateCVSubscription.created_at.desc())
        .first()
    )
    tx = _latest_paid_transaction(db, reference=latest_sub.transaction_reference) if latest_sub else None
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma transação paga encontrada")
    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reason é obrigatório")
    category = str(payload.get("category", "other")).strip()
    try:
        dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=current_user, category=category, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"dispute": {"id": dispute.id, "status": dispute.status}}
