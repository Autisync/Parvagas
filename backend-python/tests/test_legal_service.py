"""Tests for the versioned legal-document CMS service layer
(app.services.legal_service) — the publish invariant (at most one
published version per document at a time) and the acceptance-tracking
helpers used to gate re-consent (Wave C2).
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalAcceptance, LegalDocument, LegalDocumentVersion, User, UserRole
from app.services import legal_service


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db):
    user = User(id=str(uuid.uuid4()), email=f"u-{uuid.uuid4()}@parvagas.pt", full_name="U", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()
    return user


def test_create_document_and_draft_version(db):
    doc = legal_service.create_document(db, slug="termos", title="Termos e Condições", category="tos", requires_acceptance=True)
    assert doc.id
    assert legal_service.get_document_by_slug(db, "termos").id == doc.id

    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="# Termos\n\nConteúdo.")
    assert version.status == "draft"
    assert legal_service.get_current_version(db, doc.id) is None  # draft isn't current yet


def test_publish_promotes_draft_to_current(db):
    doc = legal_service.create_document(db, slug="privacidade", title="Privacidade", category="privacy")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1 body")

    published = legal_service.publish_legal_version(db, v1)

    assert published.status == "published"
    assert published.published_at is not None
    current = legal_service.get_current_version(db, doc.id)
    assert current.id == v1.id


def test_publishing_new_version_archives_the_old_one(db):
    doc = legal_service.create_document(db, slug="cookies", title="Cookies", category="cookies")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1")
    legal_service.publish_legal_version(db, v1)

    v2 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v2", body_markdown="v2")
    legal_service.publish_legal_version(db, v2)

    db.refresh(v1)
    assert v1.status == "archived"
    current = legal_service.get_current_version(db, doc.id)
    assert current.id == v2.id

    # At most one published version, ever — invariant check via direct query.
    published_count = (
        db.query(LegalDocumentVersion)
        .filter(LegalDocumentVersion.document_id == doc.id, LegalDocumentVersion.status == "published")
        .count()
    )
    assert published_count == 1


def test_editing_a_published_version_is_rejected(db):
    doc = legal_service.create_document(db, slug="retencao", title="Retenção", category="retention")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1")
    legal_service.publish_legal_version(db, v1)

    with pytest.raises(ValueError):
        legal_service.update_draft_version(db, v1, body_markdown="tampered")


def test_editing_a_draft_version_works(db):
    doc = legal_service.create_document(db, slug="aup", title="AUP", category="aup")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="draft body")

    updated = legal_service.update_draft_version(db, v1, body_markdown="revised draft body")
    assert updated.body_markdown == "revised draft body"


def test_record_acceptance_and_has_accepted_current_version(db):
    user = _make_user(db)
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos", requires_acceptance=True)
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1")
    legal_service.publish_legal_version(db, v1)

    assert legal_service.has_accepted_current_version(db, user_id=user.id, slug="termos") is False

    legal_service.record_acceptance(db, user_id=user.id, document_version_id=v1.id, context="signup", ip_address="1.2.3.4")

    assert legal_service.has_accepted_current_version(db, user_id=user.id, slug="termos") is True
    row = db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id).first()
    assert row.context == "signup"
    assert row.document_version_id == v1.id


def test_republishing_a_new_version_invalidates_prior_acceptance(db):
    """Acceptance is tied to a specific version id — once a NEW version
    becomes current, an old acceptance no longer satisfies
    has_accepted_current_version(). This is the mechanism Wave C2's
    re-consent prompt relies on."""
    user = _make_user(db)
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos", requires_acceptance=True)
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1")
    legal_service.publish_legal_version(db, v1)
    legal_service.record_acceptance(db, user_id=user.id, document_version_id=v1.id, context="signup")
    assert legal_service.has_accepted_current_version(db, user_id=user.id, slug="termos") is True

    v2 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v2", body_markdown="v2 — materially changed")
    legal_service.publish_legal_version(db, v2)

    assert legal_service.has_accepted_current_version(db, user_id=user.id, slug="termos") is False


def test_has_accepted_current_version_true_when_nothing_published_yet(db):
    """A document with no published version at all shouldn't block on
    consent it can't even display."""
    user = _make_user(db)
    legal_service.create_document(db, slug="dpa", title="DPA", category="dpa", requires_acceptance=True)
    assert legal_service.has_accepted_current_version(db, user_id=user.id, slug="dpa") is True


def test_list_documents_filters_by_audience_and_category(db):
    legal_service.create_document(db, slug="termos", title="Termos", category="tos", audience="public")
    legal_service.create_document(db, slug="msa", title="MSA", category="msa", audience="employer")
    legal_service.create_document(db, slug="seguranca", title="Segurança", category="security_policy", audience="internal")

    assert {d.slug for d in legal_service.list_documents(db)} == {"termos", "msa", "seguranca"}
    assert {d.slug for d in legal_service.list_documents(db, audience="employer")} == {"msa"}
    assert {d.slug for d in legal_service.list_documents(db, category="security_policy")} == {"seguranca"}


def test_list_versions_returns_all_including_archived(db):
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="v1")
    legal_service.publish_legal_version(db, v1)
    v2 = legal_service.create_draft_version(db, document_id=doc.id, version_label="v2", body_markdown="v2")
    legal_service.publish_legal_version(db, v2)

    versions = legal_service.list_versions(db, doc.id)
    assert {v.id for v in versions} == {v1.id, v2.id}
    statuses = {v.id: v.status for v in versions}
    assert statuses[v1.id] == "archived"
    assert statuses[v2.id] == "published"
