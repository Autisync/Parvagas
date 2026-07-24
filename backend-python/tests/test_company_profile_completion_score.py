"""Regression test — the company Dashboard's "Perfil da Empresa" card reads
profile.completionScore, but _serialize_company_profile() never included
that key (the company-side analogue of candidates.py's
_profile_completion_score existed only as a frontend assumption), so the
card was permanently stuck at 0% regardless of how complete the profile
actually was.
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
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active")
    db.add(company)
    db.commit()
    return owner, company


def test_empty_profile_has_low_completion_score(db):
    owner, company = _make_owner_and_company(db)
    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert result["company"]["completionScore"] == 0


def test_filled_profile_has_higher_completion_score(db):
    owner, company = _make_owner_and_company(db)
    asyncio.run(update_company_profile(
        {
            "industry": "Tecnologia", "size": "34", "website": "https://autisync.com",
            "location": "Luanda, Talatona", "contactEmail": "hello@autisync.com",
            "description": "We help businesses modernise their brand and systems.",
        },
        db=db, current_user=owner,
    ))
    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert result["company"]["completionScore"] > 0
    assert result["company"]["completionScore"] < 100  # logo/benefits/social/gallery still empty


def test_fully_filled_profile_reaches_100_percent(db):
    owner, company = _make_owner_and_company(db)
    company.logo_url = "https://cdn.example.com/logo.png"
    db.commit()
    asyncio.run(update_company_profile(
        {
            "industry": "Tecnologia", "size": "34", "website": "https://autisync.com",
            "location": "Luanda, Talatona", "contactEmail": "hello@autisync.com",
            "description": "We help businesses modernise their brand and systems.",
            "benefits": ["Seguro de saúde"],
        },
        db=db, current_user=owner,
    ))
    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert result["company"]["completionScore"] == 100
