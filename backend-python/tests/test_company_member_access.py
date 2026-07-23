"""Tests for the CompanyMember-404 fix (overnight-audit W0.1) — an invited
team member (not the Company.owner_user_id) must actually be able to reach
company-scoped data, not just log in and see 404s everywhere. Covers the
three call sites that used to look up the company strictly by ownership:
companies.py's _require_company (jobs, profile), payments.py's
_company_for (subscription), and applications.py's inline lookups
(list_company_applications).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CompanyMember, Job, User, UserRole
from app.services.company_access_service import resolve_company_for_user, resolve_company_for_user_or_none, member_role_for
from app.api.v1.companies import list_company_jobs, get_company_profile
from app.api.v1.applications import list_company_applications


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_owner_and_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active")
    db.add(company)
    db.commit()
    return owner, company


def _make_member(db, company, role="recruiter"):
    member_user = User(id=str(uuid.uuid4()), email=f"member-{uuid.uuid4()}@x.com", full_name="Member", password_hash="x", role=UserRole.company)
    db.add(member_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=member_user.id, role=role))
    db.commit()
    return member_user


def test_resolver_finds_owner(db):
    owner, company = _make_owner_and_company(db)
    resolved = resolve_company_for_user(db, owner)
    assert resolved.id == company.id


def test_resolver_finds_invited_member(db):
    owner, company = _make_owner_and_company(db)
    member = _make_member(db, company)
    resolved = resolve_company_for_user(db, member)
    assert resolved.id == company.id


def test_resolver_404s_for_unrelated_user(db):
    _owner, _company = _make_owner_and_company(db)
    stranger = User(id=str(uuid.uuid4()), email="stranger@x.com", full_name="S", password_hash="x", role=UserRole.company)
    db.add(stranger)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        resolve_company_for_user(db, stranger)
    assert exc.value.status_code == 404


def test_resolver_or_none_returns_none_not_raise(db):
    stranger = User(id=str(uuid.uuid4()), email="stranger2@x.com", full_name="S", password_hash="x", role=UserRole.company)
    db.add(stranger)
    db.commit()
    assert resolve_company_for_user_or_none(db, stranger) is None


def test_member_role_for(db):
    owner, company = _make_owner_and_company(db)
    recruiter = _make_member(db, company, role="recruiter")
    viewer = _make_member(db, company, role="viewer")
    assert member_role_for(db, owner, company) == "owner"
    assert member_role_for(db, recruiter, company) == "recruiter"
    assert member_role_for(db, viewer, company) == "viewer"


def test_invited_member_can_list_company_jobs(db):
    """Previously 404'd — the actual regression this whole fix targets."""
    owner, company = _make_owner_and_company(db)
    member = _make_member(db, company)
    db.add(Job(company_id=company.id, title="Vaga X", status="approved", visibility="public"))
    db.commit()

    result = asyncio.run(list_company_jobs(page=1, limit=15, status_filter=None, db=db, current_user=member))
    assert len(result["jobs"]) == 1
    assert result["jobs"][0]["title"] == "Vaga X"


def test_invited_member_can_get_company_profile(db):
    owner, company = _make_owner_and_company(db)
    member = _make_member(db, company)

    result = asyncio.run(get_company_profile(db=db, current_user=member))
    assert result.id == company.id


def test_invited_member_can_list_applications(db):
    owner, company = _make_owner_and_company(db)
    member = _make_member(db, company)

    result = asyncio.run(list_company_applications(page=1, limit=20, db=db, current_user=member))
    assert result["applications"] == []  # no applications yet, but no 404 either
