"""Tests for GET /legal/my-acceptances — "Os meus documentos" self-service
acceptance history (Wave X2, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
"""
import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalAcceptance, User, UserRole
from app.services import legal_service
from app.api.v1.legal import my_legal_acceptances


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_user(db):
    user = User(id=str(uuid.uuid4()), email=f"u-{uuid.uuid4()}@x.com", full_name="U", password_hash="x", role=UserRole.candidate)
    db.add(user)
    db.commit()
    return user


def _publish(db, slug, title, category):
    doc = legal_service.create_document(db, slug=slug, title=title, category=category)
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="x")
    return legal_service.publish_legal_version(db, version)


def test_empty_history_for_new_user(db):
    user = _make_user(db)
    result = asyncio.run(my_legal_acceptances(db=db, current_user=user))
    assert result["acceptances"] == []


def test_lists_accepted_documents_newest_first(db):
    user = _make_user(db)
    termos = _publish(db, "termos", "Termos", "tos")
    privacidade = _publish(db, "privacidade", "Privacidade", "privacy")
    legal_service.record_acceptance(db, user_id=user.id, document_version_id=termos.id, context="signup")
    legal_service.record_acceptance(db, user_id=user.id, document_version_id=privacidade.id, context="signup")

    result = asyncio.run(my_legal_acceptances(db=db, current_user=user))
    slugs = [a["slug"] for a in result["acceptances"]]
    assert set(slugs) == {"termos", "privacidade"}
    assert all(a["context"] == "signup" for a in result["acceptances"])


def test_marks_current_vs_superseded_version(db):
    user = _make_user(db)
    doc = legal_service.create_document(db, slug="termos", title="Termos", category="tos")
    v1 = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-06", body_markdown="v1")
    v1 = legal_service.publish_legal_version(db, v1)
    legal_service.record_acceptance(db, user_id=user.id, document_version_id=v1.id, context="signup")

    v2 = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="v2")
    legal_service.publish_legal_version(db, v2)  # archives v1

    result = asyncio.run(my_legal_acceptances(db=db, current_user=user))
    assert len(result["acceptances"]) == 1
    assert result["acceptances"][0]["versionLabel"] == "2026-06"
    assert result["acceptances"][0]["isCurrentVersion"] is False


def test_only_returns_the_calling_users_own_acceptances(db):
    user1 = _make_user(db)
    user2 = _make_user(db)
    termos = _publish(db, "termos", "Termos", "tos")
    legal_service.record_acceptance(db, user_id=user1.id, document_version_id=termos.id, context="signup")

    result = asyncio.run(my_legal_acceptances(db=db, current_user=user2))
    assert result["acceptances"] == []
