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
from app.models import Company, Plan, Subscription, Transaction, User, UserRole

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
