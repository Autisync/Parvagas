"""Tests for the admin security-incident API surface (Wave X1,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import User, UserRole
from app.api.v1.admin import (
    admin_assess_security_incident,
    admin_close_security_incident,
    admin_contain_security_incident,
    admin_create_security_incident,
    admin_get_security_incident,
    admin_list_security_incidents,
    admin_note_security_incident,
    admin_notify_authority_security_incident,
    admin_remediate_security_incident,
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


def test_create_and_list_incident(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "Login burst", "description": "x", "severity": "alta"}, db=db, current_user=admin))
    assert created["severity"] == "alta"

    listing = asyncio.run(admin_list_security_incidents(openOnly=False, db=db, current_user=admin))
    assert len(listing["incidents"]) == 1


def test_get_incident_includes_log(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "baixa"}, db=db, current_user=admin))
    detail = asyncio.run(admin_get_security_incident(created["id"], db=db, current_user=admin))
    assert len(detail["log"]) == 1


def test_get_incident_404s_for_unknown_id(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_get_security_incident("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404


def test_contain_requires_action_field(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "alta"}, db=db, current_user=admin))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_contain_security_incident(created["id"], {"action": ""}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_assess_sets_notification_deadline(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "critica"}, db=db, current_user=admin))
    result = asyncio.run(admin_assess_security_incident(
        created["id"],
        {"isPersonalDataBreach": True, "riskLevel": "high", "affectedDataCategories": "emails", "affectedSubjectCountEstimate": 5},
        db=db, current_user=admin,
    ))
    assert result["isPersonalDataBreach"] is True
    assert result["notificationDeadline"] is not None
    assert result["hoursRemaining"] is not None


def test_notify_authority_requires_super_admin(db):
    admin = _make_admin(db)
    moderator = _make_admin(db, admin_level="moderator")
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "critica"}, db=db, current_user=admin))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_notify_authority_security_incident(created["id"], db=db, current_user=moderator))
    assert exc.value.status_code == 403


def test_notify_authority_succeeds_for_super_admin(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "critica"}, db=db, current_user=admin))
    result = asyncio.run(admin_notify_authority_security_incident(created["id"], db=db, current_user=admin))
    assert result["authorityNotifiedAt"] is not None


def test_remediate_and_close_requires_super_admin_for_close(db):
    admin = _make_admin(db)
    moderator = _make_admin(db, admin_level="moderator")
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "baixa"}, db=db, current_user=admin))

    remediated = asyncio.run(admin_remediate_security_incident(created["id"], {"notes": "corrigido"}, db=db, current_user=moderator))
    assert remediated["remediatedAt"] is not None

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_close_security_incident(created["id"], {"reviewNotes": "x"}, db=db, current_user=moderator))
    assert exc.value.status_code == 403

    closed = asyncio.run(admin_close_security_incident(created["id"], {"reviewNotes": "x"}, db=db, current_user=admin))
    assert closed["closedAt"] is not None


def test_add_note(db):
    admin = _make_admin(db)
    created = asyncio.run(admin_create_security_incident({"title": "X", "description": "Y", "severity": "baixa"}, db=db, current_user=admin))
    result = asyncio.run(admin_note_security_incident(created["id"], {"note": "a verificar amanhã"}, db=db, current_user=admin))
    assert result["body"] == "a verificar amanhã"
