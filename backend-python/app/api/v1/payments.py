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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import (
    CandidateCVSubscription, CandidateProfile,
    Company, Plan, Subscription, Transaction, User, UserRole,
)
from app.workers.tasks import send_templated_email
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["payments"])

# Seed catalogue used when no plans exist in the DB yet (Angola pricing, AOA).
_DEFAULT_PLANS = [
    {"code": "free", "name": "Grátis", "price": 0, "interval": "month",
     "features": ["1 vaga ativa", "Candidaturas ilimitadas"]},
    {"code": "starter", "name": "Starter", "price": 25000, "interval": "month",
     "features": ["5 vagas ativas", "Destaque básico", "Suporte por email"]},
    {"code": "business", "name": "Business", "price": 75000, "interval": "month",
     "features": ["Vagas ilimitadas", "Vagas em destaque", "Acesso à base de CVs", "Analytics"]},
    {"code": "featured_post", "name": "Vaga em Destaque", "price": 15000, "interval": "one_time",
     "features": ["1 vaga destacada por 30 dias"]},
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
                    interval=d["interval"], features=json.dumps(d["features"], ensure_ascii=True), active=True))
    db.commit()
    return db.query(Plan).filter(Plan.active.is_(True)).all()


@router.get("/plans")
async def list_plans(db: Session = Depends(get_db)):
    """Public plan catalogue."""
    return {"plans": [_serialize_plan(p) for p in _ensure_seed_plans(db)]}


def _company_for(db: Session, user: User) -> Company:
    co = db.query(Company).filter(Company.owner_user_id == user.id).first()
    if not co:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return co


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
    }}


@router.post("/companies/subscribe")
async def subscribe(payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a pending subscription + a payment reference for a local rail."""
    co = _company_for(db, current_user)
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
# Three tiers (AOA pricing for Angola market):
#   free     – 1 resume, basic templates, no AI
#   pro      – 3 resumes, all templates, AI score, PDF export  (15 000 AOA/month)
#   premium  – Unlimited resumes, AI rewrite, cover letters,   (30 000 AOA/month)
#              auto-apply queue, priority support
#
# Payment flow mirrors the company subscription flow (manual → bank reference →
# admin/webhook confirms → subscription activates).

_CV_BUILDER_PLANS = [
    {
        "tier": "free", "name": "CV Grátis", "price": 0, "interval": "month",
        "features": ["1 CV", "Modelos básicos", "Download PDF"],
        "limits": {"max_resumes": 1, "ai_score": False, "ai_rewrite": False,
                   "cover_letters": False, "auto_apply": False},
    },
    {
        "tier": "pro", "name": "CV Pro", "price": 15000, "interval": "month",
        "features": ["3 CVs", "Todos os modelos", "Pontuação ATS por IA",
                     "Export PDF e DOCX", "Carta de apresentação"],
        "limits": {"max_resumes": 3, "ai_score": True, "ai_rewrite": False,
                   "cover_letters": True, "auto_apply": False},
    },
    {
        "tier": "premium", "name": "CV Premium", "price": 30000, "interval": "month",
        "features": ["CVs ilimitados", "IA rewrite completo", "Fila auto-candidatura",
                     "Suporte prioritário", "Todas as funcionalidades Pro"],
        "limits": {"max_resumes": -1, "ai_score": True, "ai_rewrite": True,
                   "cover_letters": True, "auto_apply": True},
    },
]


@router.get("/cv-builder/plans")
async def list_cv_builder_plans():
    """Public CV Builder plan catalogue."""
    return {"plans": _CV_BUILDER_PLANS}


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
    plan_info = next((p for p in _CV_BUILDER_PLANS if p["tier"] == tier), _CV_BUILDER_PLANS[0])

    return {
        "subscription": {
            "_id": sub.id if sub else None,
            "status": sub.status if sub else "active",
            "tier": tier,
            "plan": plan_info,
            "currentPeriodEnd": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        }
    }


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
    plan_info = next((p for p in _CV_BUILDER_PLANS if p["tier"] == tier), None)
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
    return {"activated": True, "tier": sub.plan_tier, "reference": reference}
