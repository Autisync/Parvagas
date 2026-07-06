"""Tests for candidate auto-apply preference capture (job categories + opt-in).

This only persists candidate intent — the actual auto-submission engine is a
future paid feature and isn't implemented yet (see model/endpoint comments).
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateProfile, User, UserRole
from app.api.v1.candidates import _apply_profile_payload, _profile_to_payload


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user_and_profile(db):
    user = User(
        id=str(uuid.uuid4()), email="candidate@example.com", full_name="Test Candidate",
        password_hash="x", role=UserRole.candidate,
    )
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id)
    db.add(profile)
    db.flush()
    return user, profile


def test_defaults_to_opted_out_with_no_categories(db):
    user, profile = _make_user_and_profile(db)
    payload = _profile_to_payload(db, user, profile)
    assert payload["preferredJobCategories"] == []
    assert payload["autoApplyOptIn"] is False


def test_saves_categories_and_opt_in(db):
    user, profile = _make_user_and_profile(db)
    _apply_profile_payload(profile, user, {
        "preferredJobCategories": ["Tecnologia", "Energia"],
        "autoApplyOptIn": True,
    })
    db.commit()

    payload = _profile_to_payload(db, user, profile)
    assert payload["preferredJobCategories"] == ["Tecnologia", "Energia"]
    assert payload["autoApplyOptIn"] is True


def test_opting_out_clears_flag_but_keeps_categories(db):
    user, profile = _make_user_and_profile(db)
    _apply_profile_payload(profile, user, {"preferredJobCategories": ["Saude"], "autoApplyOptIn": True})
    db.commit()

    _apply_profile_payload(profile, user, {"autoApplyOptIn": False})
    db.commit()

    payload = _profile_to_payload(db, user, profile)
    assert payload["autoApplyOptIn"] is False
    assert payload["preferredJobCategories"] == ["Saude"]
