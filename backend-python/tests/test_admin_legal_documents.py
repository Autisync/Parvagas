"""Tests for the admin legal-document management endpoints (Wave L3) —
create/edit/publish versions, super-admin gating, and the immutability of
a published version once it's live.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalAcceptance, LegalDocument, LegalDocumentVersion, User, UserRole
from app.services import legal_service
from app.api.v1.admin import (
    admin_create_legal_document,
    admin_create_legal_document_version,
    admin_get_legal_document,
    admin_legal_document_acceptance_summary,
    admin_list_legal_documents,
    admin_publish_legal_document_version,
    admin_update_legal_document,
    admin_update_legal_document_version,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_admin(db, admin_level=None):
    user = User(
        id=str(uuid.uuid4()), email=f"admin-{uuid.uuid4()}@parvagas.pt",
        full_name="Admin", password_hash="x", role=UserRole.admin,
        **({"admin_level": admin_level} if admin_level else {}),
    )
    db.add(user)
    db.commit()
    return user


def _make_super_admin(db):
    return _make_admin(db, admin_level="super-admin")


def test_create_document_requires_super_admin(db):
    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_legal_document(
            {"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=moderator,
        ))
    assert exc.value.status_code == 403
    assert db.query(LegalDocument).count() == 0


def test_create_document(db):
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_legal_document(
        {"slug": "termos", "title": "Termos", "category": "tos", "audience": "public", "requiresAcceptance": True},
        db=db, current_user=admin,
    ))
    assert result["slug"] == "termos"
    assert result["currentVersion"] is None  # no version yet


def test_create_document_rejects_invalid_slug(db):
    admin = _make_super_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_legal_document(
            {"slug": "Não Válido!", "title": "X", "category": "tos"}, db=db, current_user=admin,
        ))
    assert exc.value.status_code == 400


def test_create_document_rejects_duplicate_slug(db):
    admin = _make_super_admin(db)
    asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Outro", "category": "tos"}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_full_draft_edit_publish_flow(db):
    admin = _make_super_admin(db)
    doc = asyncio.run(admin_create_legal_document(
        {"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin,
    ))
    version = asyncio.run(admin_create_legal_document_version(
        doc["_id"], {"versionLabel": "v1", "bodyMarkdown": "rascunho inicial"}, db=db, current_user=admin,
    ))
    assert version["status"] == "draft"

    edited = asyncio.run(admin_update_legal_document_version(
        doc["_id"], version["_id"], {"bodyMarkdown": "texto revisto"}, db=db, current_user=admin,
    ))
    assert edited["bodyMarkdown"] == "texto revisto"

    published = asyncio.run(admin_publish_legal_document_version(doc["_id"], version["_id"], db=db, current_user=admin))
    assert published["status"] == "published"

    detail = asyncio.run(admin_get_legal_document(doc["_id"], db=db, current_user=admin))
    assert detail["currentVersion"]["_id"] == version["_id"]


def test_cannot_edit_published_version(db):
    admin = _make_super_admin(db)
    doc = asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin))
    version = asyncio.run(admin_create_legal_document_version(doc["_id"], {"versionLabel": "v1", "bodyMarkdown": "v1"}, db=db, current_user=admin))
    asyncio.run(admin_publish_legal_document_version(doc["_id"], version["_id"], db=db, current_user=admin))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_legal_document_version(doc["_id"], version["_id"], {"bodyMarkdown": "tampered"}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_cannot_publish_already_published_version(db):
    admin = _make_super_admin(db)
    doc = asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin))
    version = asyncio.run(admin_create_legal_document_version(doc["_id"], {"versionLabel": "v1", "bodyMarkdown": "v1"}, db=db, current_user=admin))
    asyncio.run(admin_publish_legal_document_version(doc["_id"], version["_id"], db=db, current_user=admin))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_publish_legal_document_version(doc["_id"], version["_id"], db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_list_includes_internal_audience_documents(db):
    """Unlike the public /legal API, the admin listing must show internal
    documents too — that's exactly what this admin UI is for."""
    admin = _make_super_admin(db)
    asyncio.run(admin_create_legal_document({"slug": "seguranca", "title": "Segurança", "category": "security_policy", "audience": "internal"}, db=db, current_user=admin))
    result = asyncio.run(admin_list_legal_documents(audience=None, db=db, current_user=admin))
    slugs = {d["slug"] for d in result["legalDocuments"]}
    assert "seguranca" in slugs


def test_update_document_metadata(db):
    admin = _make_super_admin(db)
    doc = asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin))
    updated = asyncio.run(admin_update_legal_document(doc["_id"], {"title": "Termos e Condições Gerais", "requiresAcceptance": True}, db=db, current_user=admin))
    assert updated["title"] == "Termos e Condições Gerais"
    assert updated["requiresAcceptance"] is True


def test_acceptance_summary_counts_distinct_users(db):
    admin = _make_super_admin(db)
    doc = asyncio.run(admin_create_legal_document({"slug": "termos", "title": "Termos", "category": "tos"}, db=db, current_user=admin))
    version = asyncio.run(admin_create_legal_document_version(doc["_id"], {"versionLabel": "v1", "bodyMarkdown": "v1"}, db=db, current_user=admin))
    asyncio.run(admin_publish_legal_document_version(doc["_id"], version["_id"], db=db, current_user=admin))

    u1 = User(id=str(uuid.uuid4()), email="a@x.com", full_name="A", password_hash="x", role=UserRole.candidate)
    u2 = User(id=str(uuid.uuid4()), email="b@x.com", full_name="B", password_hash="x", role=UserRole.candidate)
    db.add_all([u1, u2])
    db.commit()
    legal_service.record_acceptance(db, user_id=u1.id, document_version_id=version["_id"], context="signup")
    legal_service.record_acceptance(db, user_id=u2.id, document_version_id=version["_id"], context="signup")

    summary = asyncio.run(admin_legal_document_acceptance_summary(doc["_id"], db=db, current_user=admin))
    assert summary["acceptedCount"] == 2
