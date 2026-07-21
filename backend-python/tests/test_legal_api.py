"""Tests for the public legal-document API (app.api.v1.legal) — the /legal
hub listing and individual document fetch. Internal-audience documents
must never appear here, published-only, 404 semantics for unpublished/
unknown/internal slugs.
"""
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalDocument, LegalDocumentVersion  # noqa: F401 — registers tables with Base.metadata
from app.services import legal_service
from app.api.v1.legal import get_public_legal_document, list_public_legal_documents


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _publish(db, slug, title, category, audience, body="Conteúdo."):
    doc = legal_service.create_document(db, slug=slug, title=title, category=category, audience=audience)
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown=body)
    legal_service.publish_legal_version(db, version)
    return doc


def test_list_only_returns_public_and_employer_audience(db):
    _publish(db, "termos", "Termos", "tos", "public")
    _publish(db, "msa", "MSA", "msa", "employer")
    _publish(db, "seguranca-incidentes", "Segurança", "security_policy", "internal")

    result = asyncio.run(list_public_legal_documents(db=db))

    slugs = {d["slug"] for d in result["documents"]}
    assert slugs == {"termos", "msa"}


def test_list_omits_documents_with_no_published_version(db):
    doc = legal_service.create_document(db, slug="reembolsos", title="Reembolsos", category="refund", audience="public")
    legal_service.create_draft_version(db, document_id=doc.id, version_label="v1", body_markdown="rascunho")

    result = asyncio.run(list_public_legal_documents(db=db))

    assert result["documents"] == []


def test_get_document_returns_full_body(db):
    _publish(db, "privacidade", "Política de Privacidade", "privacy", "public", body="## 1. Secção\n\nTexto real.")

    result = asyncio.run(get_public_legal_document("privacidade", db=db))

    assert result["title"] == "Política de Privacidade"
    assert result["bodyMarkdown"] == "## 1. Secção\n\nTexto real."
    assert result["versionLabel"] == "v1"


def test_get_document_404_for_internal_audience(db):
    _publish(db, "acesso-administrativo", "Acesso Admin", "admin_policy", "internal")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_legal_document("acesso-administrativo", db=db))
    assert exc.value.status_code == 404


def test_get_document_404_for_unknown_slug(db):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_legal_document("does-not-exist", db=db))
    assert exc.value.status_code == 404


def test_get_document_404_when_no_published_version(db):
    legal_service.create_document(db, slug="cookies", title="Cookies", category="cookies", audience="public")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_public_legal_document("cookies", db=db))
    assert exc.value.status_code == 404
