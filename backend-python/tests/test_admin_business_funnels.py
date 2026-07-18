"""Tests for GET /admin/analytics/funnels — business-funnel rollups from
data that already existed (User, Job, JobApplication, CVUpload,
NewsletterSubscriber) but was never surfaced anywhere, plus the two new
infra checks (Celery queue depth, Postgres DB size) added to
admin_launch_readiness.
"""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, CVUpload, Job, JobApplication, NewsletterSubscriber, User, UserRole
from app.api.v1.admin import admin_business_funnels_analytics, admin_launch_readiness


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


def _make_candidate(db, verified=False, email=None):
    user = User(
        id=str(uuid.uuid4()), email=email or f"cand-{uuid.uuid4()}@x.com", full_name="Cand",
        password_hash="x", role=UserRole.candidate, email_verified=verified,
    )
    db.add(user)
    db.commit()
    return user


def _make_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()
    return company


def _find_check(result, check_id):
    return next((c for c in result["checks"] if c["id"] == check_id), None)


# ── Signup -> verified -> applied funnel ─────────────────────────────────────

def test_signup_funnel_counts_candidates_only(db):
    admin = _make_admin(db)
    _make_candidate(db, verified=True)
    _make_candidate(db, verified=False)
    _make_company(db)  # not a candidate — must not count toward signups

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    funnel = result["signupFunnel"]
    assert funnel["signups"] == 2
    assert funnel["verified"] == 1
    assert funnel["verifiedRate"] == 50.0


def test_signup_funnel_counts_distinct_applicants(db):
    admin = _make_admin(db)
    candidate = _make_candidate(db, verified=True)
    company = _make_company(db)
    job = Job(company_id=company.id, title="Vaga", status="approved", visibility="public")
    db.add(job)
    db.flush()
    db.add(JobApplication(job_id=job.id, applicant_full_name="Cand", applicant_email=candidate.email, candidate_user_id=candidate.id))
    db.add(JobApplication(job_id=job.id, applicant_full_name="Cand", applicant_email=candidate.email, candidate_user_id=candidate.id))
    db.commit()

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    # Two applications from the SAME candidate count once (distinct).
    assert result["signupFunnel"]["appliedAtLeastOnce"] == 1


def test_signup_funnel_rates_none_with_no_candidates(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))
    assert result["signupFunnel"]["signups"] == 0
    assert result["signupFunnel"]["verifiedRate"] is None


# ── Moderation SLA ────────────────────────────────────────────────────────────

def test_moderation_sla_computes_avg_and_median_hours(db):
    admin = _make_admin(db)
    company = _make_company(db)
    now = datetime.utcnow()
    j1 = Job(company_id=company.id, title="A", status="approved", visibility="public", created_at=now - timedelta(hours=10), published_at=now)
    j2 = Job(company_id=company.id, title="B", status="approved", visibility="public", created_at=now - timedelta(hours=20), published_at=now)
    unpublished = Job(company_id=company.id, title="C", status="pending_platform_review", visibility="public")
    db.add_all([j1, j2, unpublished])
    db.commit()

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    sla = result["moderationSla"]
    assert sla["sampleSize"] == 2
    assert sla["avgHours"] == 15.0
    assert sla["medianHours"] == 15.0


def test_moderation_sla_none_when_nothing_published(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))
    assert result["moderationSla"]["sampleSize"] == 0
    assert result["moderationSla"]["avgHours"] is None


# ── CV parse failure rate ─────────────────────────────────────────────────────

def test_cv_parse_failure_rate_excludes_in_flight_and_not_applicable(db):
    from app.models import CandidateProfile

    admin = _make_admin(db)
    candidate = _make_candidate(db)
    profile = CandidateProfile(user_id=candidate.id)
    db.add(profile)
    db.flush()
    for status in ["completed", "completed", "failed", "pending", "not_applicable"]:
        db.add(CVUpload(
            candidate_id=profile.id, file_name="cv.pdf", file_path="x", file_size=1,
            mime_type="application/pdf", parse_status=status,
        ))
    db.commit()

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    cv = result["cvParsing"]
    assert cv["completed"] == 2
    assert cv["failed"] == 1
    # 1 failed / (2 completed + 1 failed) = 33.3%, not 1/5.
    assert cv["failureRate"] == pytest.approx(33.3, abs=0.1)


# ── Newsletter growth ─────────────────────────────────────────────────────────

def test_newsletter_counts_active_vs_total(db):
    admin = _make_admin(db)
    db.add(NewsletterSubscriber(email="a@x.com"))
    db.add(NewsletterSubscriber(email="b@x.com", unsubscribed_at=datetime.utcnow()))
    db.commit()

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    nl = result["newsletter"]
    assert nl["totalSubscribers"] == 2
    assert nl["activeSubscribers"] == 1


# ── Spam-score distribution ───────────────────────────────────────────────────

def test_spam_score_distribution_buckets(db):
    admin = _make_admin(db)
    company = _make_company(db)
    scores = [0, 0, 10, 60, 90]
    for i, score in enumerate(scores):
        db.add(Job(company_id=company.id, title=f"J{i}", status="approved", visibility="public", spam_score=score))
    db.commit()

    result = asyncio.run(admin_business_funnels_analytics(db=db, current_user=admin))

    by_label = {b["label"]: b["value"] for b in result["spamScoreDistribution"]}
    assert by_label["0"] == 2
    assert by_label["1-25"] == 1
    assert by_label["51-75"] == 1
    assert by_label["76-100"] == 1


# ── Launch-readiness infra checks ─────────────────────────────────────────────

def test_celery_check_warns_when_no_workers_respond(db, monkeypatch):
    admin = _make_admin(db)

    class _FakeInspect:
        def active(self):
            return {}

        def reserved(self):
            return {}

    from app.workers.celery_app import celery
    monkeypatch.setattr(celery.control, "inspect", lambda timeout=None: _FakeInspect())

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    check = _find_check(result, "celery")
    assert check is not None
    assert check["status"] == "warn"


def test_celery_check_passes_when_workers_respond(db, monkeypatch):
    admin = _make_admin(db)

    class _FakeInspect:
        def active(self):
            return {"worker1@host": [{"id": "t1"}]}

        def reserved(self):
            return {"worker1@host": []}

    from app.workers.celery_app import celery
    monkeypatch.setattr(celery.control, "inspect", lambda timeout=None: _FakeInspect())

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    check = _find_check(result, "celery")
    assert check["status"] == "pass"
    assert "1 worker" in check["message"]


def test_celery_check_never_breaks_readiness_page_on_broker_error(db, monkeypatch):
    admin = _make_admin(db)

    def _raise(*a, **k):
        raise ConnectionError("broker unreachable")

    from app.workers.celery_app import celery
    monkeypatch.setattr(celery.control, "inspect", _raise)

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    check = _find_check(result, "celery")
    assert check["status"] == "warn"
    assert result["summary"]["total"] > 0  # the rest of the page still rendered


def test_db_size_check_skipped_on_sqlite(db):
    """This test suite runs on SQLite — pg_database_size has no
    equivalent, so the check should be omitted entirely, not shown as a
    permanent warning."""
    admin = _make_admin(db)

    result = asyncio.run(admin_launch_readiness(db=db, current_user=admin))

    assert _find_check(result, "db-size") is None
