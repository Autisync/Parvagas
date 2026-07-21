"""Tests for the payment-dispute API surfaces: self-service /account
endpoints and the admin dispute queue (Wave D,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, PaymentDispute, Plan, Subscription, Transaction, User, UserRole
from app.api.v1.account import file_dispute, get_my_dispute, list_dispute_categories, list_my_disputes
from app.api.v1.admin import (
    admin_assign_dispute,
    admin_close_dispute_no_response,
    admin_get_dispute,
    admin_list_disputes,
    admin_refund_dispute,
    admin_reject_dispute,
    admin_request_dispute_info,
    admin_resolve_dispute,
)


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="super-admin"):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@x.com", full_name="Admin", password_hash="x", role=UserRole.admin, admin_level=admin_level)
    db.add(admin)
    db.commit()
    return admin


def _make_paid_company_tx(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    plan = Plan(code=f"p-{uuid.uuid4()}", name="Business", price=75000, currency="AOA", interval="month", features="[]", active=True)
    db.add(plan)
    db.flush()
    tx = Transaction(company_id=company.id, plan_id=plan.id, amount=75000, currency="AOA", provider="manual", reference=f"PV-{uuid.uuid4().hex[:8]}", status="paid")
    db.add(tx)
    db.flush()
    db.add(Subscription(company_id=company.id, plan_id=plan.id, status="active"))
    db.commit()
    return owner, tx


def test_list_dispute_categories(db):
    result = asyncio.run(list_dispute_categories())
    assert any(c["key"] == "billing_error" for c in result["categories"])


def test_file_dispute_requires_ownership(db):
    owner, tx = _make_paid_company_tx(db)
    stranger = User(id=str(uuid.uuid4()), email="stranger@x.com", full_name="Stranger", password_hash="x", role=UserRole.company)
    db.add(stranger)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=stranger))
    assert exc.value.status_code == 404


def test_file_dispute_succeeds_for_owner(db):
    owner, tx = _make_paid_company_tx(db)
    result = asyncio.run(file_dispute(
        {"transactionReference": tx.reference, "category": "billing_error", "reason": "cobrado duas vezes"},
        db=db, current_user=owner,
    ))
    assert result["dispute"]["status"] == "open"


def test_list_and_get_my_dispute(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))
    dispute_id = created["dispute"]["id"]

    mine = asyncio.run(list_my_disputes(db=db, current_user=owner))
    assert len(mine["disputes"]) == 1

    detail = asyncio.run(get_my_dispute(dispute_id, db=db, current_user=owner))
    assert detail["id"] == dispute_id
    assert len(detail["messages"]) == 1  # Modelo A ack


def test_get_my_dispute_404s_for_other_users_dispute(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))
    stranger = User(id=str(uuid.uuid4()), email="stranger2@x.com", full_name="Stranger", password_hash="x", role=UserRole.company)
    db.add(stranger)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_my_dispute(created["dispute"]["id"], db=db, current_user=stranger))
    assert exc.value.status_code == 404


# ── admin queue ──────────────────────────────────────────────────────────────

def test_admin_list_and_assign(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))
    admin = _make_admin(db)

    listing = asyncio.run(admin_list_disputes(status_filter=None, db=db, current_user=admin))
    assert len(listing["disputes"]) == 1

    result = asyncio.run(admin_assign_dispute(created["dispute"]["id"], db=db, current_user=admin))
    assert result["status"] == "under_review"


def test_admin_decision_endpoints_require_super_admin(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))
    moderator = _make_admin(db, admin_level="moderator")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resolve_dispute(created["dispute"]["id"], {"decisionNote": "ok"}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_admin_full_refund_flow(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "cobrança duplicada"}, db=db, current_user=owner))
    admin = _make_admin(db)

    result = asyncio.run(admin_refund_dispute(
        created["dispute"]["id"], {"refundAmount": 75000, "isPartial": False, "summary": "cobrança duplicada confirmada"},
        db=db, current_user=admin,
    ))
    assert result["status"] == "refunded"
    db.refresh(tx)
    assert tx.status == "refunded"


def test_admin_reject_flow(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "não gostei"}, db=db, current_user=owner))
    admin = _make_admin(db)

    result = asyncio.run(admin_reject_dispute(
        created["dispute"]["id"], {"rejectionReason": "fora da política de reembolsos"}, db=db, current_user=admin,
    ))
    assert result["status"] == "rejected"


def test_admin_close_no_response_requires_responded_state(db):
    owner, tx = _make_paid_company_tx(db)
    created = asyncio.run(file_dispute({"transactionReference": tx.reference, "reason": "x"}, db=db, current_user=owner))
    admin = _make_admin(db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_close_dispute_no_response(created["dispute"]["id"], db=db, current_user=admin))
    assert exc.value.status_code == 400

    asyncio.run(admin_request_dispute_info(created["dispute"]["id"], {"documentsRequested": "comprovativo"}, db=db, current_user=admin))
    result = asyncio.run(admin_close_dispute_no_response(created["dispute"]["id"], db=db, current_user=admin))
    assert result["status"] == "rejected"


def test_admin_get_dispute_404s_for_unknown_id(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_get_dispute("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404
