"""Tests for overnight-audit W5.2 — the candidate-side opt-in gate.
Turning on discoverableOptIn is the first channel that exposes a
candidate's profile to a company before any application exists, so it
requires accepting a dedicated consent document first (mirrors the
auto_apply_opt_in on-transition gate shape, but via the legal-acceptance
system rather than a plan-tier check, since this is a consent question
not a billing one).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, User, UserRole
from app.services import legal_service
from app.api.v1.candidates import patch_candidate_profile


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_candidate(db):
    user = User(id=str(uuid.uuid4()), email=f"cand-{uuid.uuid4()}@x.com", full_name="Cand", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()
    return user


def _seed_consent_document(db):
    doc = legal_service.create_document(
        db, slug="consentimento-diretorio-candidatos", title="Consentimento Diretório",
        category="candidate_directory_consent", requires_acceptance=True,
    )
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="corpo")
    legal_service.publish_legal_version(db, version)
    return doc, version


def test_opt_in_without_consent_400s(db):
    user = _make_candidate(db)
    _seed_consent_document(db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(patch_candidate_profile({"discoverableOptIn": True}, db=db, current_user=user))
    assert exc.value.status_code == 400


def test_opt_in_after_accepting_consent_succeeds(db):
    user = _make_candidate(db)
    _doc, version = _seed_consent_document(db)
    legal_service.record_acceptance(
        db, user_id=user.id, document_version_id=version.id, context="candidate_directory_opt_in",
    )

    result = asyncio.run(patch_candidate_profile({"discoverableOptIn": True}, db=db, current_user=user))
    assert result["profile"]["discoverableOptIn"] is True

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    assert profile.discoverable_opt_in is True


def test_opt_out_never_requires_consent(db):
    user = _make_candidate(db)
    _seed_consent_document(db)

    # No consent recorded at all — turning it off (the default state) must
    # never be blocked by the same gate that guards turning it on.
    result = asyncio.run(patch_candidate_profile({"discoverableOptIn": False}, db=db, current_user=user))
    assert result["profile"]["discoverableOptIn"] is False
