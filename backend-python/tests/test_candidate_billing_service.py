"""Tests for candidate premium-tier entitlement (Phase 4; consolidated
onto CandidateCVSubscription in C4, EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

The load-bearing guarantee: while CANDIDATE_PREMIUM_ENABLED is off (the
default — no pricing decided yet), every candidate has access regardless of
subscription state. This is what makes premium AI tools ship as a free
feature today. Once enabled, access requires an active, unexpired
CandidateCVSubscription on a paid tier (pro/premium) — "free" tier rows
(used for CV-builder-tier gating elsewhere) do NOT grant these tools.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import CandidateCVSubscription, CandidateProfile, Resume
from app.services import candidate_billing_service
from app.services.candidate_billing_service import (
    assert_auto_apply_allowed,
    assert_cover_letters_allowed,
    assert_resume_quota,
    candidate_has_premium_access,
    cv_uses_free_ai_tier,
    get_cv_plan_tier,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_access_granted_when_flag_off_even_with_no_subscription(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", False)
    assert candidate_has_premium_access(db, str(uuid.uuid4())) is True


def test_access_denied_when_flag_on_with_no_subscription(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    assert candidate_has_premium_access(db, str(uuid.uuid4())) is False


def test_access_granted_when_flag_on_with_active_unexpired_paid_tier(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert candidate_has_premium_access(db, profile_id) is True


def test_access_denied_when_subscription_on_free_tier(db, monkeypatch):
    """A "free" CandidateCVSubscription row (the CV builder's own default
    tier) must NOT grant access to the separate premium AI tools."""
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="free", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert candidate_has_premium_access(db, profile_id) is False


def test_access_denied_when_subscription_expired(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="premium", status="active",
        current_period_end=datetime.utcnow() - timedelta(days=1),
    ))
    db.commit()
    assert candidate_has_premium_access(db, profile_id) is False


def test_access_denied_when_subscription_cancelled(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="premium", status="cancelled",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert candidate_has_premium_access(db, profile_id) is False


def test_access_granted_with_no_period_end_means_ongoing(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(candidate_profile_id=profile_id, plan_tier="pro", status="active", current_period_end=None))
    db.commit()
    assert candidate_has_premium_access(db, profile_id) is True


# ── get_cv_plan_tier / cv_uses_free_ai_tier ─────────────────────────────────
# These run regardless of CANDIDATE_PREMIUM_ENABLED — they're what
# resumes.py's score_resume/rewrite_resume use to pick Ollama vs cloud AI,
# a distinction that already shipped in C1/C2 independent of the quota flag.

def test_get_cv_plan_tier_defaults_to_free_with_no_subscription(db):
    assert get_cv_plan_tier(db, str(uuid.uuid4())) == "free"


def test_get_cv_plan_tier_returns_active_paid_tier(db):
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="premium", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert get_cv_plan_tier(db, profile_id) == "premium"


def test_get_cv_plan_tier_falls_back_to_free_when_expired(db):
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() - timedelta(days=1),
    ))
    db.commit()
    assert get_cv_plan_tier(db, profile_id) == "free"


def test_cv_uses_free_ai_tier_true_for_free_plan(db):
    assert cv_uses_free_ai_tier(db, str(uuid.uuid4())) is True


def test_cv_uses_free_ai_tier_false_for_paid_plan(db):
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert cv_uses_free_ai_tier(db, profile_id) is False


# ── assert_resume_quota ──────────────────────────────────────────────────

def test_resume_quota_noop_when_flag_off(db, monkeypatch):
    """The load-bearing ship-dark guarantee for quotas: even a free-tier
    candidate already over the cap is unaffected while the flag is off."""
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", False)
    profile_id = str(uuid.uuid4())
    for _ in range(5):
        db.add(Resume(candidate_profile_id=profile_id, title="CV", data="{}"))
    db.commit()
    assert_resume_quota(db, profile_id)  # must not raise


def test_resume_quota_blocks_free_tier_at_cap(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(Resume(candidate_profile_id=profile_id, title="CV Principal", data="{}"))
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        assert_resume_quota(db, profile_id)
    assert exc_info.value.status_code == 402


def test_resume_quota_allows_below_cap(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.add(Resume(candidate_profile_id=profile_id, title="CV 1", data="{}"))
    db.commit()
    assert_resume_quota(db, profile_id)  # 1 of 3 (pro) — must not raise


def test_resume_quota_locks_the_candidate_profile_row(db, monkeypatch):
    """TOCTOU guard: two concurrent requests for the same candidate must not
    both read the same pre-insert COUNT and both pass. A real race needs two
    genuinely concurrent Postgres transactions, which this SQLite-backed
    suite can't produce (SQLite ignores FOR UPDATE outright — its own
    whole-database write lock serializes writers a different way). What IS
    verifiable here, and is the actual mechanism the fix relies on: that
    assert_resume_quota requests a row lock on the candidate's own profile
    before doing the count check."""
    from sqlalchemy.orm import Query

    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    user_id = str(uuid.uuid4())
    profile = CandidateProfile(user_id=user_id)
    db.add(profile)
    db.commit()

    locked_entities = []
    original = Query.with_for_update

    def spy(self, *a, **k):
        desc = self.column_descriptions
        if desc:
            locked_entities.append(desc[0].get("name") or desc[0].get("entity"))
        return original(self, *a, **k)

    monkeypatch.setattr(Query, "with_for_update", spy)

    assert_resume_quota(db, profile.id)  # 0 of 1 (free) — must not raise

    assert any(
        entity is CandidateProfile or entity == "CandidateProfile" for entity in locked_entities
    ), f"assert_resume_quota never locked CandidateProfile (locked: {locked_entities})"


def test_resume_quota_blocks_pro_tier_at_cap(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    for i in range(3):
        db.add(Resume(candidate_profile_id=profile_id, title=f"CV {i}", data="{}"))
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        assert_resume_quota(db, profile_id)
    assert exc_info.value.status_code == 402


def test_resume_quota_unlimited_for_premium_tier(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="premium", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    for i in range(10):
        db.add(Resume(candidate_profile_id=profile_id, title=f"CV {i}", data="{}"))
    db.commit()
    assert_resume_quota(db, profile_id)  # must not raise — premium is unlimited


# ── assert_cover_letters_allowed / assert_auto_apply_allowed ──────────────

def test_cover_letters_noop_when_flag_off(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", False)
    assert_cover_letters_allowed(db, str(uuid.uuid4()))  # must not raise


def test_cover_letters_blocked_for_free_tier(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    with pytest.raises(HTTPException) as exc_info:
        assert_cover_letters_allowed(db, str(uuid.uuid4()))
    assert exc_info.value.status_code == 402


def test_cover_letters_allowed_for_pro_tier(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert_cover_letters_allowed(db, profile_id)  # must not raise


def test_auto_apply_noop_when_flag_off(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", False)
    assert_auto_apply_allowed(db, str(uuid.uuid4()))  # must not raise


def test_auto_apply_blocked_for_pro_tier(db, monkeypatch):
    """auto_apply is premium-only — pro must NOT unlock it."""
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="pro", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        assert_auto_apply_allowed(db, profile_id)
    assert exc_info.value.status_code == 402


def test_auto_apply_allowed_for_premium_tier(db, monkeypatch):
    monkeypatch.setattr(candidate_billing_service.settings, "CANDIDATE_PREMIUM_ENABLED", True)
    profile_id = str(uuid.uuid4())
    db.add(CandidateCVSubscription(
        candidate_profile_id=profile_id, plan_tier="premium", status="active",
        current_period_end=datetime.utcnow() + timedelta(days=30),
    ))
    db.commit()
    assert_auto_apply_allowed(db, profile_id)  # must not raise
