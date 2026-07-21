"""Tests for app.services.dsar_service — the GDPR/Lei n.º 22/11 export and
erasure logic behind Wave C3 (EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models import (
    CandidateProfile, Company, DataSubjectRequest, JobApplication, RefreshToken, User, UserRole,
)
from app.services import dsar_service, legal_service


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_candidate(db, **over):
    defaults = dict(
        id=str(uuid.uuid4()), email="cand@x.com", full_name="Cand Idato",
        password_hash=hash_password("Password123!"), role=UserRole.candidate, phone="+244900000000",
    )
    defaults.update(over)
    user = User(**defaults)
    db.add(user)
    db.flush()
    profile = CandidateProfile(user_id=user.id, first_name="Cand", last_name="Idato", location="Luanda")
    db.add(profile)
    db.commit()
    return user, profile


def test_export_includes_account_and_candidate_profile(db):
    user, profile = _make_candidate(db)
    export = dsar_service.build_user_export(db, user)
    assert export["account"]["email"] == "cand@x.com"
    assert export["candidateProfile"]["firstName"] == "Cand"
    assert export["applications"] == []
    assert export["savedJobs"] == []


def test_export_includes_legal_acceptances(db):
    user, _ = _make_candidate(db)
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos")
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="x")
    version = legal_service.publish_legal_version(db, version)
    legal_service.record_acceptance(db, user_id=user.id, document_version_id=version.id, context="signup")

    export = dsar_service.build_user_export(db, user)
    assert len(export["legalAcceptances"]) == 1
    assert export["legalAcceptances"][0]["documentSlug"] == "termos"
    assert export["legalAcceptances"][0]["versionLabel"] == "2026-07"


def test_create_export_request_records_completed_audit_row(db):
    user, _ = _make_candidate(db)
    request = dsar_service.create_export_request(db, user)
    assert request.request_type == "export"
    assert request.status == "completed"
    assert request.reviewed_at is not None


def test_create_erasure_request_is_idempotent(db):
    user, _ = _make_candidate(db)
    first = dsar_service.create_erasure_request(db, user, note="não uso mais")
    second = dsar_service.create_erasure_request(db, user, note="pedido duplicado")
    assert first.id == second.id
    assert db.query(DataSubjectRequest).filter(DataSubjectRequest.user_id == user.id).count() == 1


def test_anonymize_user_scrubs_pii_and_revokes_sessions(db):
    user, profile = _make_candidate(db)
    db.add(RefreshToken(user_id=user.id, token_hash="hash123", expires_at=datetime.utcnow() + timedelta(days=7), revoked=False))
    db.commit()

    original_id = user.id
    dsar_service.anonymize_user(db, user)

    db.refresh(user)
    assert user.id == original_id
    assert user.email == f"deleted-{original_id}@parvagas.pt.invalid"
    assert user.full_name == "Utilizador Removido"
    assert user.phone is None
    assert user.suspended is True
    assert not verify_password("Password123!", user.password_hash)

    db.refresh(profile)
    assert profile.first_name is None
    assert profile.location is None

    token = db.query(RefreshToken).filter(RefreshToken.user_id == original_id).first()
    assert token.revoked is True


def test_anonymize_user_scrubs_own_applications(db):
    user, _ = _make_candidate(db)
    application = JobApplication(
        job_id=str(uuid.uuid4()), candidate_user_id=user.id,
        applicant_full_name="Cand Idato", applicant_email="cand@x.com",
        applicant_phone="+244900000000", applicant_location="Luanda", cover_letter="Olá...",
    )
    db.add(application)
    db.commit()

    dsar_service.anonymize_user(db, user)

    db.refresh(application)
    assert application.applicant_full_name == "Candidato Removido"
    assert application.applicant_phone is None
    assert application.cover_letter is None


def test_approve_erasure_completes_request_and_anonymizes(db):
    user, _ = _make_candidate(db)
    admin_id = str(uuid.uuid4())
    request = dsar_service.create_erasure_request(db, user)

    result = dsar_service.approve_erasure(db, request, reviewed_by_user_id=admin_id, admin_note="ok")

    assert result.status == "completed"
    assert result.reviewed_by_user_id == admin_id
    db.refresh(user)
    assert user.full_name == "Utilizador Removido"


def test_approve_erasure_rejects_already_reviewed_request(db):
    user, _ = _make_candidate(db)
    request = dsar_service.create_erasure_request(db, user)
    dsar_service.approve_erasure(db, request, reviewed_by_user_id="admin-1")

    with pytest.raises(ValueError):
        dsar_service.approve_erasure(db, request, reviewed_by_user_id="admin-2")


def test_reject_erasure_leaves_user_untouched(db):
    user, _ = _make_candidate(db)
    request = dsar_service.create_erasure_request(db, user)

    result = dsar_service.reject_erasure(db, request, reviewed_by_user_id="admin-1", admin_note="litígio de pagamento em curso")

    assert result.status == "rejected"
    db.refresh(user)
    assert user.email == "cand@x.com"
    assert user.suspended is False


def test_list_requests_filters_by_user_and_status(db):
    user1, _ = _make_candidate(db, email="a@x.com")
    user2, _ = _make_candidate(db, email="b@x.com")
    dsar_service.create_erasure_request(db, user1)
    dsar_service.create_export_request(db, user2)

    mine = dsar_service.list_requests(db, user_id=user1.id)
    assert len(mine) == 1
    assert mine[0].user_id == user1.id

    pending_only = dsar_service.list_requests(db, status_filter="pending")
    assert all(r.status == "pending" for r in pending_only)
