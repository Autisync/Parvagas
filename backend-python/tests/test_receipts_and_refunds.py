"""Tests for numbered receipts and refunds — Wave P3,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import (
    CandidateCVSubscription, CandidateProfile, Company, Plan, Subscription, Transaction, User, UserRole,
)
from app.services import receipt_service
from app.api.v1.payments import (
    company_subscription_receipt,
    confirm_payment,
    cv_builder_subscription_receipt,
    subscribe,
    subscribe_cv_builder,
)
from app.api.v1.admin import admin_refund_transaction, admin_transaction_receipt


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _no_email(monkeypatch):
    monkeypatch.setattr("app.api.v1.payments.send_templated_email.delay", lambda *a, **k: None)


def _make_admin(db, admin_level="super-admin"):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@x.com", full_name="Admin", password_hash="x", role=UserRole.admin, admin_level=admin_level)
    db.add(admin)
    db.commit()
    return admin


def _make_company_user(db, plan_price=75000):
    user = User(id=str(uuid.uuid4()), email=f"co-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(user)
    db.flush()
    company = Company(owner_user_id=user.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code="business", name="Business", price=plan_price, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.commit()
    return user, company, plan


# ── receipt_service ──────────────────────────────────────────────────────────

def test_assign_receipt_number_skips_zero_amount(db):
    tx = Transaction(amount=0, currency="AOA", provider="manual", reference="R1", status="paid")
    db.add(tx)
    db.commit()
    receipt_service.assign_receipt_number(db, tx)
    assert tx.receipt_number is None


def test_assign_receipt_number_is_sequential_and_idempotent(db):
    tx1 = Transaction(amount=1000, currency="AOA", provider="manual", reference="R1", status="paid")
    tx2 = Transaction(amount=1000, currency="AOA", provider="manual", reference="R2", status="paid")
    db.add_all([tx1, tx2])
    db.commit()

    receipt_service.assign_receipt_number(db, tx1)
    receipt_service.assign_receipt_number(db, tx2)
    receipt_service.assign_receipt_number(db, tx1)  # idempotent re-call

    assert tx1.receipt_number != tx2.receipt_number
    assert tx1.receipt_number.startswith("REC-")
    year = datetime.utcnow().year
    assert tx1.receipt_number == f"REC-{year}-000001"
    assert tx2.receipt_number == f"REC-{year}-000002"


def test_generate_receipt_pdf_returns_valid_pdf_bytes(db):
    tx = Transaction(amount=1000, currency="AOA", provider="manual", reference="R1", status="paid", receipt_number="REC-2026-000001")
    db.add(tx)
    db.commit()
    pdf = receipt_service.generate_receipt_pdf(tx, party_name="Acme", party_email="a@x.com", description="Plano Business")
    assert pdf[:4] == b"%PDF"


# ── payment confirmation assigns receipts ───────────────────────────────────

def test_company_subscribe_and_confirm_assigns_receipt(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]

    admin = _make_admin(db)
    asyncio.run(confirm_payment(reference, db=db, current_user=admin))

    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    assert tx.receipt_number is not None


def test_cv_builder_free_tier_never_gets_a_receipt(db):
    user = User(id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    db.add(CandidateProfile(user_id=user.id))
    db.commit()

    asyncio.run(subscribe_cv_builder({"tier": "free"}, db=db, current_user=user))
    assert db.query(Transaction).count() == 0


# ── self-service receipt download ───────────────────────────────────────────

def test_company_receipt_404s_with_no_paid_transaction(db):
    user, company, plan = _make_company_user(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(company_subscription_receipt(db=db, current_user=user))
    assert exc.value.status_code == 404


def test_company_receipt_downloads_after_payment(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    admin = _make_admin(db)
    asyncio.run(confirm_payment(reference, db=db, current_user=admin))

    response = asyncio.run(company_subscription_receipt(db=db, current_user=user))
    assert isinstance(response, Response)
    assert response.body[:4] == b"%PDF"


# ── admin refund ─────────────────────────────────────────────────────────────

def test_refund_requires_super_admin(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    admin = _make_admin(db)
    asyncio.run(confirm_payment(reference, db=db, current_user=admin))
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()

    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_refund_transaction(tx.id, {}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_refund_rejects_non_paid_transaction(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    admin = _make_admin(db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_refund_transaction(tx.id, {}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_refund_revokes_company_subscription_access(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    admin = _make_admin(db)
    asyncio.run(confirm_payment(reference, db=db, current_user=admin))
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()

    result = asyncio.run(admin_refund_transaction(tx.id, {"refundReference": "BANK-REF-1"}, db=db, current_user=admin))
    assert result["status"] == "refunded"
    assert result["refundReference"] == "BANK-REF-1"

    sub = db.query(Subscription).filter(Subscription.company_id == company.id).first()
    assert sub.status == "cancelled"
    assert sub.current_period_end is None


def test_refund_revokes_candidate_cv_subscription_access(db):
    user = User(id=str(uuid.uuid4()), email="cand2@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.commit()

    result = asyncio.run(subscribe_cv_builder({"tier": "pro", "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()
    tx.status = "paid"
    sub = db.query(CandidateCVSubscription).filter(CandidateCVSubscription.transaction_reference == reference).first()
    sub.status = "active"
    sub.current_period_end = datetime.utcnow() + timedelta(days=30)
    db.commit()
    receipt_service.assign_receipt_number(db, tx)

    admin = _make_admin(db)
    asyncio.run(admin_refund_transaction(tx.id, {}, db=db, current_user=admin))

    db.refresh(sub)
    assert sub.status == "cancelled"
    assert sub.current_period_end is None


def test_admin_transaction_receipt_404s_without_receipt_number(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    tx = db.query(Transaction).filter(Transaction.reference == result["transaction"]["reference"]).first()
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_transaction_receipt(tx.id, db=db, current_user=admin))
    assert exc.value.status_code == 404


def test_admin_transaction_receipt_downloads_pdf(db):
    user, company, plan = _make_company_user(db)
    result = asyncio.run(subscribe({"planCode": plan.code, "provider": "manual"}, db=db, current_user=user))
    reference = result["transaction"]["reference"]
    admin = _make_admin(db)
    asyncio.run(confirm_payment(reference, db=db, current_user=admin))
    tx = db.query(Transaction).filter(Transaction.reference == reference).first()

    response = asyncio.run(admin_transaction_receipt(tx.id, db=db, current_user=admin))
    assert response.body[:4] == b"%PDF"
