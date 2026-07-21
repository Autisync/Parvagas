"""Tests for version-stamped consent recording at signup (Wave C1,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md). Before this, the frontend sent
acceptTerms/acceptPrivacy on every registration but the backend never read
or persisted them — UserRegisterRequest simply didn't declare those
fields, so Pydantic silently dropped them. There was no stored proof of
consent despite the Privacy Policy claiming otherwise.
"""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalAcceptance, User, UserRole
from app.services import legal_service
from app.api.v1.auth import accept_company_invite, register
from app.schemas import UserRegisterRequest


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _fake_request(ip="9.9.9.9") -> SimpleNamespace:
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={"user-agent": "pytest-agent"})


async def _always_pass_captcha(*a, **k):
    return True


def _publish(db, slug, title, category, audience="public"):
    doc = legal_service.create_document(db, slug=slug, title=title, category=category, audience=audience)
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="conteúdo")
    return legal_service.publish_legal_version(db, version)


@pytest.fixture(autouse=True)
def _mocks(monkeypatch):
    monkeypatch.setattr("app.core.captcha.verify_captcha", _always_pass_captcha)
    monkeypatch.setattr("app.api.v1.auth.send_verification_email.delay", lambda *a, **k: None)
    monkeypatch.setattr("app.api.v1.auth.AuthService.create_verification_token", lambda db, user: "tok")


def test_register_rejects_when_terms_not_accepted(db):
    payload = UserRegisterRequest(
        email="a@x.com", password="Password123!", full_name="A", role="candidate",
        accept_terms=False, accept_privacy=True,
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(register(_fake_request(), payload, db=db))
    assert exc.value.status_code == 400
    assert db.query(User).count() == 0


def test_register_rejects_when_privacy_not_accepted(db):
    payload = UserRegisterRequest(
        email="a@x.com", password="Password123!", full_name="A", role="candidate",
        accept_terms=True, accept_privacy=False,
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(register(_fake_request(), payload, db=db))
    assert exc.value.status_code == 400
    assert db.query(User).count() == 0


def test_register_records_acceptance_for_termos_and_privacidade(db):
    termos = _publish(db, "termos", "Termos", "tos")
    privacidade = _publish(db, "privacidade", "Privacidade", "privacy")

    payload = UserRegisterRequest(
        email="cand@x.com", password="Password123!", full_name="Candidato",
        role="candidate", accept_terms=True, accept_privacy=True,
    )
    asyncio.run(register(_fake_request(ip="1.2.3.4"), payload, db=db))

    user = db.query(User).filter(User.email == "cand@x.com").first()
    assert user is not None
    acceptances = db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id).all()
    version_ids = {a.document_version_id for a in acceptances}
    assert version_ids == {termos.id, privacidade.id}
    assert all(a.context == "signup" for a in acceptances)
    assert all(a.ip_address == "1.2.3.4" for a in acceptances)
    assert all(a.user_agent == "pytest-agent" for a in acceptances)


def test_company_registration_also_records_employer_terms(db):
    _publish(db, "termos", "Termos", "tos")
    _publish(db, "privacidade", "Privacidade", "privacy")
    employer_terms = _publish(db, "termos-empregador", "Termos Empregador", "employer_tos", audience="employer")

    payload = UserRegisterRequest(
        email="co@x.com", password="Password123!", full_name="Owner", role="company",
        company_name="Acme", nif="123456789LA042", accept_terms=True, accept_privacy=True,
    )
    asyncio.run(register(_fake_request(), payload, db=db))

    user = db.query(User).filter(User.email == "co@x.com").first()
    accepted_versions = {a.document_version_id for a in db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id)}
    assert employer_terms.id in accepted_versions


def test_candidate_registration_does_not_record_employer_terms(db):
    _publish(db, "termos", "Termos", "tos")
    _publish(db, "privacidade", "Privacidade", "privacy")
    employer_terms = _publish(db, "termos-empregador", "Termos Empregador", "employer_tos", audience="employer")

    payload = UserRegisterRequest(
        email="cand2@x.com", password="Password123!", full_name="Candidato",
        role="candidate", accept_terms=True, accept_privacy=True,
    )
    asyncio.run(register(_fake_request(), payload, db=db))

    user = db.query(User).filter(User.email == "cand2@x.com").first()
    accepted_versions = {a.document_version_id for a in db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id)}
    assert employer_terms.id not in accepted_versions


def test_registration_succeeds_even_when_no_document_published_yet(db):
    """Missing legal-document rows must never block account creation —
    this is a best-effort side effect, not a hard dependency."""
    payload = UserRegisterRequest(
        email="nowhere@x.com", password="Password123!", full_name="X",
        role="candidate", accept_terms=True, accept_privacy=True,
    )
    asyncio.run(register(_fake_request(), payload, db=db))
    user = db.query(User).filter(User.email == "nowhere@x.com").first()
    assert user is not None
    assert db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id).count() == 0


def test_company_invite_accept_requires_consent_for_new_user(db):
    from app.core.security import hash_token
    from app.models import Company, CompanyInvite
    from datetime import datetime, timedelta

    owner = User(id=str(uuid.uuid4()), email="owner@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    invite = CompanyInvite(
        company_id=company.id, email="newmember@x.com", role="recruiter",
        token_hash=hash_token("tok-abc"), status="pending", expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(accept_company_invite(
            _fake_request(), {"inviteToken": "tok-abc", "password": "Password123!", "fullName": "New Member"}, db=db,
        ))
    assert exc.value.status_code == 400
    assert db.query(User).filter(User.email == "newmember@x.com").count() == 0


def test_company_invite_accept_records_consent_for_new_user(db):
    from app.core.security import hash_token
    from app.models import Company, CompanyInvite
    from datetime import datetime, timedelta

    termos = _publish(db, "termos", "Termos", "tos")
    privacidade = _publish(db, "privacidade", "Privacidade", "privacy")
    employer_terms = _publish(db, "termos-empregador", "Termos Empregador", "employer_tos", audience="employer")

    owner = User(id=str(uuid.uuid4()), email="owner2@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    invite = CompanyInvite(
        company_id=company.id, email="newmember2@x.com", role="recruiter",
        token_hash=hash_token("tok-xyz"), status="pending", expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    asyncio.run(accept_company_invite(
        _fake_request(), {
            "inviteToken": "tok-xyz", "password": "Password123!", "fullName": "New Member",
            "acceptTerms": True, "acceptPrivacy": True,
        }, db=db,
    ))

    user = db.query(User).filter(User.email == "newmember2@x.com").first()
    assert user is not None
    accepted_versions = {a.document_version_id for a in db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id)}
    assert accepted_versions == {termos.id, privacidade.id, employer_terms.id}


def test_company_invite_accept_does_not_re_record_for_existing_user(db):
    """An already-existing user joining ANOTHER company via invite doesn't
    go through account creation — no new consent event should fire since
    they never see a fresh accept-terms checkbox on this path today."""
    from app.core.security import hash_token
    from app.models import Company, CompanyInvite
    from datetime import datetime, timedelta

    _publish(db, "termos", "Termos", "tos")
    _publish(db, "privacidade", "Privacidade", "privacy")

    existing = User(id=str(uuid.uuid4()), email="already@x.com", full_name="Already", password_hash="x", role=UserRole.company)
    db.add(existing)
    db.flush()
    owner = User(id=str(uuid.uuid4()), email="owner3@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()
    invite = CompanyInvite(
        company_id=company.id, email="already@x.com", role="recruiter",
        token_hash=hash_token("tok-existing"), status="pending", expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()

    asyncio.run(accept_company_invite(_fake_request(), {"inviteToken": "tok-existing"}, db=db))

    assert db.query(LegalAcceptance).filter(LegalAcceptance.user_id == existing.id).count() == 0
