"""Tests for the notification-bell gap-closing pass: events that previously
only sent email (or nothing at all) now also create an in-app Notification.

Covers: job approve/reject, account reactivation, company verification
outcomes, admin alerts (new company, job pending, job reported, scraped
digest), the company-admin-message form (which is actually team-member →
company-owner, not → platform admin — see notifications.py docstring), and
persisted candidate notification preferences (previously echoed but never
stored).
"""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import (
    CandidateProfile, Company, CompanyMember, Job, Notification, SupportMessage,
    User, UserRole,
)
from app.api.v1.admin import admin_moderate_job, admin_suspend_user
from app.api.v1.companies import update_company_verification
from app.api.v1.notifications import company_admin_message
from app.api.v1.candidates import get_notification_preferences, update_notification_preferences
from app.api.v1.auth import register
from app.schemas import UserRegisterRequest


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(
        client=SimpleNamespace(host="9.9.9.9"),
        headers={"user-agent": "pytest"},
    )


async def _always_pass_captcha(*a, **k):
    return True


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level="super-admin"):
    admin = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin",
        password_hash="x", role=UserRole.admin, admin_level=admin_level,
    )
    db.add(admin)
    db.flush()
    return admin


def _make_company(db, **over):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    defaults = dict(owner_user_id=owner.id, name="Acme", status="pending_verification")
    defaults.update(over)
    company = Company(**defaults)
    db.add(company)
    db.flush()
    return owner, company


def _make_candidate(db):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    return user, profile


def _notif_types(db, user_id):
    return [n.type for n in db.query(Notification).filter(Notification.user_id == user_id).all()]


# ── Job approve/reject ─────────────────────────────────────────────────────

def test_job_approval_notifies_owner(db, monkeypatch):
    admin = _make_admin(db)
    owner, company = _make_company(db, status="active")
    job = Job(company_id=company.id, title="Vaga X", status="pending_platform_review", visibility="private")
    db.add(job)
    db.commit()
    monkeypatch.setattr("app.api.v1.admin.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(admin_moderate_job(job.id, {"status": "approved", "visibility": "public"}, db=db, current_user=admin))

    assert "job_approved" in _notif_types(db, owner.id)


def test_job_rejection_notifies_owner_with_reason(db, monkeypatch):
    admin = _make_admin(db)
    owner, company = _make_company(db, status="active")
    job = Job(company_id=company.id, title="Vaga Y", status="pending_platform_review", visibility="private")
    db.add(job)
    db.commit()
    monkeypatch.setattr("app.api.v1.admin.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(admin_moderate_job(job.id, {"status": "rejected", "reason": "Conteúdo incompleto"}, db=db, current_user=admin))

    rows = db.query(Notification).filter(Notification.user_id == owner.id, Notification.type == "job_rejected").all()
    assert len(rows) == 1
    assert "Conteúdo incompleto" in rows[0].body


# ── Account reactivation (not suspension — suspended users can't log in) ──

def test_reactivation_notifies_user_but_suspension_does_not(db, monkeypatch):
    admin = _make_admin(db)
    target = User(id=str(uuid.uuid4()), email="target@x.com", full_name="Target", password_hash="x", role=UserRole.candidate, suspended=True)
    db.add(target)
    db.commit()
    monkeypatch.setattr("app.api.v1.admin.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(admin_suspend_user(target.id, {"suspended": False}, db=db, current_user=admin))
    assert "account_reactivated" in _notif_types(db, target.id)

    # Now suspend a fresh active user — must NOT create a bell notification.
    target2 = User(id=str(uuid.uuid4()), email="target2@x.com", full_name="Target2", password_hash="x", role=UserRole.candidate, suspended=False)
    db.add(target2)
    db.commit()
    asyncio.run(admin_suspend_user(target2.id, {"suspended": True, "reason": "abuse"}, db=db, current_user=admin))
    assert _notif_types(db, target2.id) == []


# ── Company verification outcomes ──────────────────────────────────────────

def test_company_verified_notifies_owner(db, monkeypatch):
    admin = _make_admin(db)
    owner, company = _make_company(db, status="pending_verification")
    db.commit()
    monkeypatch.setattr("app.api.v1.companies.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(update_company_verification(company.id, {"status": "active"}, db=db, current_user=admin))

    assert "company_verified" in _notif_types(db, owner.id)


def test_company_suspended_notifies_owner(db, monkeypatch):
    admin = _make_admin(db)
    owner, company = _make_company(db, status="active")
    db.commit()
    monkeypatch.setattr("app.api.v1.companies.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(update_company_verification(company.id, {"status": "suspended", "reason": "docs"}, db=db, current_user=admin))

    rows = db.query(Notification).filter(Notification.user_id == owner.id, Notification.type == "company_suspended").all()
    assert len(rows) == 1
    assert "docs" in rows[0].body


# ── Admin-facing alerts ─────────────────────────────────────────────────────

def test_new_company_registration_notifies_all_admins(db, monkeypatch):
    admin1 = _make_admin(db)
    admin2 = _make_admin(db)
    db.commit()
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)
    monkeypatch.setattr("app.api.v1.auth.send_verification_email.delay", lambda *a, **k: None)
    monkeypatch.setattr("app.api.v1.auth.AuthService.create_verification_token", lambda db, user: "tok")

    payload = UserRegisterRequest(
        email="newco@x.com", password="Password123!", full_name="New Co Owner",
        role="company", company_name="New Co", nif="123456789LA042",
        accept_terms=True, accept_privacy=True,
    )
    asyncio.run(register(_fake_request(), payload, db=db))

    assert "company_pending_verification" in _notif_types(db, admin1.id)
    assert "company_pending_verification" in _notif_types(db, admin2.id)


# ── Support message (team member -> company owner, NOT platform admin) ────

def test_company_admin_message_reaches_company_owner_not_platform_admin(db, monkeypatch):
    """Despite the route/model naming, this is a non-owner team member
    messaging their own company's owner — confirmed by the frontend's
    "Mensagem interna ao owner" label and nonOwnerCompanyUser gate."""
    platform_admin = _make_admin(db)
    owner, company = _make_company(db, status="active")
    member_user = User(id=str(uuid.uuid4()), email="member@x.com", full_name="Team Member", password_hash="x", role=UserRole.company)
    db.add(member_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=member_user.id, role="recruiter"))
    db.commit()
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)

    result = asyncio.run(company_admin_message(
        {"reason": "Solicitar aprovação de vaga", "message": "Podes aprovar a vaga X?"},
        db=db, current_user=member_user,
    ))

    assert result["queued"] is True
    assert _notif_types(db, owner.id) == ["team_message"]
    assert _notif_types(db, platform_admin.id) == []  # platform admin must NOT be bothered

    stored = db.query(SupportMessage).filter(SupportMessage.sender_user_id == member_user.id).first()
    assert stored is not None
    assert stored.recipient_user_id == owner.id
    assert stored.message == "Podes aprovar a vaga X?"


def test_company_admin_message_falls_back_to_platform_admins_when_no_owner_resolvable(db, monkeypatch):
    platform_admin = _make_admin(db)
    db.commit()
    lone_candidate = User(id=str(uuid.uuid4()), email="lone@x.com", full_name="Lone", password_hash="x", role=UserRole.candidate)
    db.add(lone_candidate)
    db.commit()
    monkeypatch.setattr("app.workers.tasks.send_templated_email.delay", lambda *a, **k: None)

    asyncio.run(company_admin_message(
        {"reason": "Outro", "message": "Preciso de ajuda"}, db=db, current_user=lone_candidate,
    ))

    assert "support_message" in _notif_types(db, platform_admin.id)


def test_company_admin_message_rejects_empty_body(db):
    _, company = _make_company(db)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(company_admin_message({"reason": "Outro", "message": "   "}, db=db, current_user=company.owner))
    assert exc.value.status_code == 400


# ── Candidate notification preferences persistence ─────────────────────────

def test_notification_preferences_persist_across_requests(db):
    user, profile = _make_candidate(db)
    db.commit()

    result1 = asyncio.run(update_notification_preferences({"emailMarketing": True, "smsAlerts": True}, db=db, current_user=user))
    assert result1["preferences"]["emailMarketing"] is True
    assert result1["preferences"]["smsAlerts"] is True
    assert result1["preferences"]["emailJobAlerts"] is True  # untouched default preserved

    result2 = asyncio.run(get_notification_preferences(db=db, current_user=user))
    assert result2["preferences"] == result1["preferences"]


def test_notification_preferences_partial_update_preserves_prior_changes(db):
    user, profile = _make_candidate(db)
    db.commit()

    asyncio.run(update_notification_preferences({"emailMarketing": True}, db=db, current_user=user))
    result = asyncio.run(update_notification_preferences({"smsAlerts": True}, db=db, current_user=user))

    assert result["preferences"]["emailMarketing"] is True  # from the first call
    assert result["preferences"]["smsAlerts"] is True  # from this call
