"""Tests for the admin company-team rollup — CompanyMember/CompanyInvite
data already existed with zero admin-facing view before this endpoint.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_token
from app.db.base import Base
from app.models import Company, CompanyInvite, CompanyMember, User, UserRole
from app.api.v1.admin import admin_company_team


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db):
    admin = User(id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt", full_name="Admin", password_hash="x", role=UserRole.admin)
    db.add(admin)
    db.commit()
    return admin


def _make_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return company, owner


def test_returns_owner_and_members(db):
    admin = _make_admin(db)
    company, owner = _make_company(db)
    member_user = User(id=str(uuid.uuid4()), email="member@x.com", full_name="Member", password_hash="x", role=UserRole.company)
    db.add(member_user)
    db.flush()
    db.add(CompanyMember(company_id=company.id, user_id=member_user.id, role="recruiter"))
    db.commit()

    result = asyncio.run(admin_company_team(company.id, db=db, current_user=admin))

    assert result["owner"]["id"] == owner.id
    assert len(result["members"]) == 1
    assert result["members"][0]["email"] == "member@x.com"
    assert result["members"][0]["role"] == "recruiter"
    assert result["memberCount"] == 2


def test_returns_only_pending_invites(db):
    admin = _make_admin(db)
    company, owner = _make_company(db)
    db.add(CompanyInvite(
        company_id=company.id, email="pending@x.com", role="viewer",
        token_hash=hash_token("t1"), status="pending", expires_at=datetime.utcnow() + timedelta(days=7),
    ))
    db.add(CompanyInvite(
        company_id=company.id, email="accepted@x.com", role="recruiter",
        token_hash=hash_token("t2"), status="accepted", expires_at=datetime.utcnow() + timedelta(days=7),
    ))
    db.commit()

    result = asyncio.run(admin_company_team(company.id, db=db, current_user=admin))

    assert len(result["pendingInvites"]) == 1
    assert result["pendingInvites"][0]["email"] == "pending@x.com"


def test_404_for_missing_company(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_company_team("does-not-exist", db=db, current_user=admin))
    assert exc.value.status_code == 404


def test_empty_team_when_no_members_or_invites(db):
    admin = _make_admin(db)
    company, owner = _make_company(db)

    result = asyncio.run(admin_company_team(company.id, db=db, current_user=admin))

    assert result["members"] == []
    assert result["pendingInvites"] == []
    assert result["memberCount"] == 1
