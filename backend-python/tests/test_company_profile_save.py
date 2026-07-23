"""Tests for the company profile save fix (overnight-audit W0.3):

1. The endpoint is PUT (frontend used to send PATCH, which 405'd — the
   endpoint itself never existed under PATCH, so this is really "does the
   PUT handler work", proven by exercising it directly).
2. The response is wrapped in {"company": ...} — the frontend reads
   `companyData.company`, but the old handler returned the bare object,
   so a successful load always produced an empty form.
3. Response keys are camelCase matching what the frontend reads (logo,
   ownerUserId, contactEmail, contactPhone, industry, size, location) —
   the old raw ORM serialization emitted snake_case that never matched.
4. industry/size/location actually persist — they had no backing column
   before migration 20260723_0065.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, User, UserRole
from app.api.v1.companies import get_company_profile, update_company_profile


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
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active", logo_url="server:logos/acme.png")
    db.add(company)
    db.commit()
    return owner, company


def test_get_profile_wraps_in_company_key(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert "company" in result
    assert result["company"]["_id"] == company.id


def test_get_profile_uses_camel_case_and_logo_field(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    payload = result["company"]
    assert "ownerUserId" in payload
    assert payload["ownerUserId"] == owner.id
    assert "logo" in payload  # not logo_url — resolving the signed URL itself needs real storage config, not under test here


def test_update_profile_persists_industry_size_location(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(update_company_profile(
        {"industry": "Tecnologia", "size": "50-200", "location": "Luanda, Talatona"},
        db=db, current_user=owner,
    ))
    assert result["company"]["industry"] == "Tecnologia"
    assert result["company"]["size"] == "50-200"
    assert result["company"]["location"] == "Luanda, Talatona"

    db.refresh(company)
    assert company.industry == "Tecnologia"
    assert company.size == "50-200"
    assert company.location == "Luanda, Talatona"


def test_update_profile_contact_email_phone_alias_onto_email_phone(db):
    owner, company = _make_owner_and_company(db)
    asyncio.run(update_company_profile(
        {"contactEmail": "rh@acme.co.ao", "contactPhone": "+244900000000"},
        db=db, current_user=owner,
    ))
    db.refresh(company)
    assert company.email == "rh@acme.co.ao"
    assert company.phone == "+244900000000"


def test_update_profile_round_trips_through_get(db):
    """The exact regression: save, then reload — the two envelope/casing
    bugs together meant a save could 'succeed' yet the next GET showed an
    empty form."""
    owner, company = _make_owner_and_company(db)
    asyncio.run(update_company_profile({"name": "Acme Angola Lda", "description": "Somos uma empresa de tecnologia."}, db=db, current_user=owner))

    reloaded = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert reloaded["company"]["name"] == "Acme Angola Lda"
    assert reloaded["company"]["description"] == "Somos uma empresa de tecnologia."
