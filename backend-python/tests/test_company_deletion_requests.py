"""Tests for company deletion requests — previously an in-memory list
(`_deletion_requests` in companies.py) wiped on every restart and not
shared across worker processes; now a durable CompanyDeletionRequest table.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyDeletionRequest, User, UserRole
from app.api.v1.companies import create_deletion_request, list_deletion_requests, review_deletion_request


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="moderator"):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin, admin_level=admin_level,
    )
    db.add(admin)
    db.flush()
    return admin


def _make_company(db, status="active"):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status=status, email="acme@x.com")
    db.add(company)
    db.flush()
    return company


def test_moderator_creates_pending_request(db):
    moderator = _make_admin(db, admin_level="moderator")
    company = _make_company(db)
    db.commit()

    result = asyncio.run(create_deletion_request(company.id, {"reason": "Documentos inválidos"}, db=db, current_user=moderator))

    assert result["mode"] == "pending"
    assert result["request"]["companyId"] == company.id
    assert result["request"]["status"] == "pending_admin_approval"
    assert result["request"]["requestedBy"]["email"] == moderator.email
    assert db.query(CompanyDeletionRequest).count() == 1
    # Company status must NOT change yet — a moderator can only request, not decide.
    db.refresh(company)
    assert company.status == "active"


def test_super_admin_deletes_directly_without_a_request_row(db):
    admin = _make_admin(db, admin_level="super-admin")
    company = _make_company(db)
    db.commit()

    result = asyncio.run(create_deletion_request(company.id, {"reason": "Fraude confirmada"}, db=db, current_user=admin))

    assert result["mode"] == "direct"
    assert db.query(CompanyDeletionRequest).count() == 0
    db.refresh(company)
    assert company.status == "rejected"


def test_list_deletion_requests_visible_only_to_super_admin(db):
    moderator = _make_admin(db, admin_level="moderator")
    super_admin = _make_admin(db, admin_level="super-admin")
    company = _make_company(db)
    db.commit()
    asyncio.run(create_deletion_request(company.id, {"reason": "x"}, db=db, current_user=moderator))

    as_moderator = asyncio.run(list_deletion_requests(db=db, current_user=moderator))
    assert as_moderator["requests"] == []  # moderators can't see the queue

    as_super_admin = asyncio.run(list_deletion_requests(db=db, current_user=super_admin))
    assert len(as_super_admin["requests"]) == 1


def test_super_admin_approves_request_and_rejects_company(db):
    moderator = _make_admin(db, admin_level="moderator")
    super_admin = _make_admin(db, admin_level="super-admin")
    company = _make_company(db)
    db.commit()
    created = asyncio.run(create_deletion_request(company.id, {"reason": "x"}, db=db, current_user=moderator))
    request_id = created["request"]["_id"]

    result = asyncio.run(review_deletion_request(
        request_id, {"decision": "approve", "reviewNote": "Confirmado"}, db=db, current_user=super_admin,
    ))

    assert result["request"]["status"] == "approved"
    assert result["request"]["reviewNote"] == "Confirmado"
    db.refresh(company)
    assert company.status == "rejected"


def test_moderator_cannot_review_requests(db):
    moderator = _make_admin(db, admin_level="moderator")
    company = _make_company(db)
    db.commit()
    created = asyncio.run(create_deletion_request(company.id, {"reason": "x"}, db=db, current_user=moderator))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(review_deletion_request(
            created["request"]["_id"], {"decision": "approve"}, db=db, current_user=moderator,
        ))
    assert exc.value.status_code == 403


def test_rejecting_a_request_does_not_change_company_status(db):
    moderator = _make_admin(db, admin_level="moderator")
    super_admin = _make_admin(db, admin_level="super-admin")
    company = _make_company(db, status="active")
    db.commit()
    created = asyncio.run(create_deletion_request(company.id, {"reason": "x"}, db=db, current_user=moderator))

    asyncio.run(review_deletion_request(
        created["request"]["_id"], {"decision": "reject"}, db=db, current_user=super_admin,
    ))

    db.refresh(company)
    assert company.status == "active"


def test_create_deletion_request_requires_reason(db):
    moderator = _make_admin(db, admin_level="moderator")
    company = _make_company(db)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_deletion_request(company.id, {"reason": "  "}, db=db, current_user=moderator))
    assert exc.value.status_code == 400
