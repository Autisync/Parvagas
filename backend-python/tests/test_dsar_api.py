"""Tests for the DSAR API surfaces: self-service /account endpoints
(app.api.v1.account) and the admin erasure queue (app.api.v1.admin) —
Wave C3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.db.base import Base
from app.models import CandidateProfile, DataSubjectRequest, User, UserRole
from app.api.v1.account import export_my_data, list_my_data_requests, request_erasure
from app.api.v1.admin import admin_approve_dsar_request, admin_list_dsar_requests, admin_reject_dsar_request


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db, role=UserRole.candidate, **over):
    defaults = dict(
        id=str(uuid.uuid4()), email=f"u-{uuid.uuid4()}@x.com", full_name="U",
        password_hash=hash_password("Password123!"), role=role,
    )
    defaults.update(over)
    user = User(**defaults)
    db.add(user)
    db.flush()
    if role == UserRole.candidate:
        db.add(CandidateProfile(user_id=user.id, first_name="U"))
    db.commit()
    return user


def _make_admin(db, admin_level="super-admin"):
    return _make_user(db, role=UserRole.admin, admin_level=admin_level)


def test_export_my_data_returns_payload_and_records_audit_row(db):
    user = _make_user(db)
    result = asyncio.run(export_my_data(db=db, current_user=user))
    assert result["account"]["email"] == user.email
    row = db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).first()
    assert row.request_type == "export"
    assert row.status == "completed"


def test_request_erasure_creates_pending_row(db):
    user = _make_user(db)
    result = asyncio.run(request_erasure({"note": "não uso mais"}, db=db, current_user=user))
    assert result["request"]["status"] == "pending"
    assert result["request"]["requestType"] == "erasure"


def test_list_my_data_requests_only_returns_own(db):
    user1 = _make_user(db)
    user2 = _make_user(db)
    asyncio.run(request_erasure({}, db=db, current_user=user1))
    asyncio.run(request_erasure({}, db=db, current_user=user2))

    result = asyncio.run(list_my_data_requests(db=db, current_user=user1))
    assert len(result["requests"]) == 1


def test_admin_list_requires_admin(db):
    user = _make_user(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_list_dsar_requests(status_filter=None, db=db, current_user=user))
    assert exc.value.status_code == 403


def test_admin_approve_requires_super_admin(db):
    user = _make_user(db)
    asyncio.run(request_erasure({}, db=db, current_user=user))
    request = db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).first()
    moderator = _make_admin(db, admin_level="moderator")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_approve_dsar_request(request.id, {}, db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_admin_approve_anonymizes_user_and_completes_request(db):
    user = _make_user(db)
    asyncio.run(request_erasure({"note": "quero sair"}, db=db, current_user=user))
    request = db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).first()
    admin = _make_admin(db)

    result = asyncio.run(admin_approve_dsar_request(request.id, {"adminNote": "aprovado"}, db=db, current_user=admin))

    assert result["status"] == "completed"
    db.refresh(user)
    assert user.full_name == "Utilizador Removido"


def test_admin_reject_requires_note(db):
    user = _make_user(db)
    asyncio.run(request_erasure({}, db=db, current_user=user))
    request = db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).first()
    admin = _make_admin(db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_reject_dsar_request(request.id, {"adminNote": ""}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_admin_reject_preserves_user_data(db):
    user = _make_user(db)
    asyncio.run(request_erasure({}, db=db, current_user=user))
    request = db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).first()
    admin = _make_admin(db)

    result = asyncio.run(admin_reject_dsar_request(
        request.id, {"adminNote": "litígio de pagamento em curso"}, db=db, current_user=admin,
    ))

    assert result["status"] == "rejected"
    db.refresh(user)
    assert user.full_name == "U"


def test_admin_approve_404s_for_unknown_request(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_approve_dsar_request("does-not-exist", {}, db=db, current_user=admin))
    assert exc.value.status_code == 404
