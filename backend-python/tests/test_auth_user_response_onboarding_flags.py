"""Tests for AuthService.build_user_response — the onboarding/tutorial flags.

Regression coverage for a bug where these flags were never included in the
login/me response (they live on CandidateProfile/Company, not User), so the
frontend always fell back to its defaults and re-forced the onboarding wizard
on every login, even for candidates who had already completed it.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, Company, CompanyMember, User, UserRole
from app.services.auth_service import AuthService


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_candidate(db):
    user = User(
        id=str(uuid.uuid4()), email="candidate@example.com", full_name="Candidate",
        password_hash="x", role=UserRole.candidate,
    )
    db.add(user)
    db.flush()
    return user


def test_candidate_who_completed_onboarding_is_not_forced_back(db):
    user = _make_candidate(db)
    profile = CandidateProfile(user_id=user.id, has_completed_onboarding=True, has_seen_tutorial=True)
    db.add(profile)
    db.commit()

    payload = AuthService.build_user_response(db, user)
    assert payload["has_completed_onboarding"] is True
    assert payload["has_seen_tutorial"] is True


def test_candidate_with_no_profile_row_defaults_to_not_onboarded(db):
    user = _make_candidate(db)
    db.commit()

    payload = AuthService.build_user_response(db, user)
    assert payload["has_completed_onboarding"] is False
    assert payload["has_seen_tutorial"] is False


def test_company_owner_gets_company_status_and_owner_role(db):
    user = User(
        id=str(uuid.uuid4()), email="owner@example.com", full_name="Owner",
        password_hash="x", role=UserRole.company,
    )
    db.add(user)
    db.flush()
    company = Company(owner_user_id=user.id, name="Acme", status="active", has_seen_tutorial=True)
    db.add(company)
    db.commit()

    payload = AuthService.build_user_response(db, user)
    assert payload["company_status"] == "active"
    assert payload["has_seen_empresa_tutorial"] is True
    assert payload["company_team_role"] == "owner"


def test_company_team_member_gets_member_role_not_owner(db):
    owner = User(
        id=str(uuid.uuid4()), email="owner2@example.com", full_name="Owner",
        password_hash="x", role=UserRole.company,
    )
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.flush()

    member_user = User(
        id=str(uuid.uuid4()), email="member@example.com", full_name="Member",
        password_hash="x", role=UserRole.company,
    )
    db.add(member_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=member_user.id, role="recruiter"))
    db.commit()

    payload = AuthService.build_user_response(db, member_user)
    assert payload["company_team_role"] == "recruiter"
    assert payload["company_status"] == "active"


def test_candidate_response_never_includes_company_fields(db):
    user = _make_candidate(db)
    db.commit()

    payload = AuthService.build_user_response(db, user)
    assert "company_status" not in payload
    assert "company_team_role" not in payload
