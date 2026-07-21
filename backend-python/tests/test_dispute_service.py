"""Tests for app.services.dispute_service — the payment-dispute state
machine and canned templates from fluxo-resolucao-disputas.md /
modelo-resposta-disputa.md (Wave D, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import (
    CandidateCVSubscription, CandidateProfile, Company, PaymentDispute, PaymentDisputeMessage,
    Plan, Subscription, Transaction, User, UserRole,
)
from app.services import dispute_service


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
    sub = Subscription(company_id=company.id, plan_id=plan.id, status="active", current_period_end=None)
    db.add(sub)
    db.commit()
    return owner, tx, sub


def test_create_dispute_requires_paid_transaction(db):
    owner, tx, _ = _make_paid_company_tx(db)
    tx.status = "pending"
    db.commit()
    with pytest.raises(ValueError):
        dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="billing_error", reason="cobrado duas vezes")


def test_create_dispute_sends_modelo_a_and_starts_open(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="billing_error", reason="cobrado duas vezes")
    assert dispute.status == "open"
    messages = dispute_service.list_messages(db, dispute.id)
    assert len(messages) == 1
    assert messages[0].template_code == "A"
    assert "cobrado duas vezes" not in messages[0].subject  # sanity: subject is fixed, not reason-derived


def test_create_dispute_normalizes_unknown_category(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="not-a-real-category", reason="x")
    assert dispute.category == "other"


def test_assign_moves_open_to_under_review(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    admin = _make_admin(db)
    dispute = dispute_service.assign_to_admin(db, dispute, admin)
    assert dispute.status == "under_review"
    assert dispute.assigned_admin_user_id == admin.id


def test_request_info_sets_responded_and_sends_modelo_b(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    dispute = dispute_service.request_info(db, dispute, documents_requested="comprovativo de pagamento")
    assert dispute.status == "responded"
    assert dispute.info_requested_at is not None
    messages = dispute_service.list_messages(db, dispute.id)
    assert messages[-1].template_code == "B"
    assert "comprovativo de pagamento" in messages[-1].body


def test_resolve_no_refund_sets_resolved(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    admin = _make_admin(db)
    dispute = dispute_service.resolve_no_refund(db, dispute, admin=admin, decision_note="esclarecido, sem alteração")
    assert dispute.status == "resolved"
    assert dispute.resolved_by_user_id == admin.id
    assert dispute.resolved_at is not None


def test_full_refund_marks_transaction_refunded_and_revokes_access(db):
    owner, tx, sub = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="billing_error", reason="cobrança duplicada")
    admin = _make_admin(db)

    dispute = dispute_service.refund(db, dispute, admin=admin, refund_amount=75000, is_partial=False, summary="cobrança duplicada confirmada")

    assert dispute.status == "refunded"
    assert dispute.refund_amount == 75000
    db.refresh(tx)
    assert tx.status == "refunded"
    assert tx.refunded_at is not None
    db.refresh(sub)
    assert sub.status == "cancelled"
    assert sub.current_period_end is None
    messages = dispute_service.list_messages(db, dispute.id)
    assert messages[-1].template_code == "C"


def test_partial_refund_does_not_touch_transaction_status(db):
    owner, tx, sub = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="dissatisfaction", reason="serviço parcialmente indisponível")
    admin = _make_admin(db)

    dispute = dispute_service.refund(db, dispute, admin=admin, refund_amount=20000, is_partial=True, summary="crédito parcial por indisponibilidade")

    assert dispute.status == "refunded"
    assert dispute.refund_amount == 20000
    db.refresh(tx)
    assert tx.status == "paid"  # untouched — partial refunds don't flip the transaction record
    db.refresh(sub)
    assert sub.status == "active"  # access left alone for a partial refund
    messages = dispute_service.list_messages(db, dispute.id)
    assert messages[-1].template_code == "D"


def test_reject_sends_modelo_e(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="dissatisfaction", reason="não gostei do serviço")
    admin = _make_admin(db)

    dispute = dispute_service.reject(db, dispute, admin=admin, rejection_reason="fora do âmbito da política de reembolsos")

    assert dispute.status == "rejected"
    messages = dispute_service.list_messages(db, dispute.id)
    assert messages[-1].template_code == "E"
    assert "fora do âmbito" in messages[-1].body


def test_close_no_response_sends_modelo_f(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    dispute = dispute_service.request_info(db, dispute, documents_requested="comprovativo")
    admin = _make_admin(db)

    dispute = dispute_service.close_no_response(db, dispute, admin=admin)

    assert dispute.status == "rejected"
    messages = dispute_service.list_messages(db, dispute.id)
    assert messages[-1].template_code == "F"


def test_internal_note_is_not_a_user_facing_message(db):
    owner, tx, _ = _make_paid_company_tx(db)
    dispute = dispute_service.create_dispute(db, transaction=tx, filed_by=owner, category="other", reason="x")
    admin = _make_admin(db)

    dispute_service.add_internal_note(db, dispute, admin=admin, note="parece legítimo, a confirmar com o financeiro")

    all_messages = dispute_service.list_messages(db, dispute.id)
    assert any(m.is_internal_note for m in all_messages)
    user_facing = [m for m in all_messages if not m.is_internal_note]
    assert len(user_facing) == 1  # only the Modelo A ack


def test_list_disputes_filters_by_status_and_user(db):
    owner1, tx1, _ = _make_paid_company_tx(db)
    owner2, tx2, _ = _make_paid_company_tx(db)
    d1 = dispute_service.create_dispute(db, transaction=tx1, filed_by=owner1, category="other", reason="x")
    dispute_service.create_dispute(db, transaction=tx2, filed_by=owner2, category="other", reason="y")

    mine = dispute_service.list_disputes(db, user_id=owner1.id)
    assert len(mine) == 1
    assert mine[0].id == d1.id

    open_only = dispute_service.list_disputes(db, status_filter="open")
    assert len(open_only) == 2
