"""Tests for the authenticated re-consent endpoints (Wave C2) —
GET /legal/my-pending-acceptances and POST /legal/acceptances. Covers
role-based audience scoping (a candidate is never blocked by an
employer-only document, and vice versa), the version-drift trigger
(publishing a new version un-satisfies a prior acceptance), and that
accepting resolves the pending list.
"""
import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import LegalAcceptance, User, UserRole
from app.services import legal_service
from app.api.v1.legal import my_pending_legal_acceptances, record_my_legal_acceptance


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _fake_request(ip="1.2.3.4") -> SimpleNamespace:
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={"user-agent": "pytest"})


def _make_user(db, role=UserRole.candidate):
    user = User(id=str(uuid.uuid4()), email=f"u-{uuid.uuid4()}@parvagas.pt", full_name="U", password_hash="x", role=role)
    db.add(user)
    db.commit()
    return user


def _publish(db, slug, title, category, audience="public", requires_acceptance=True):
    doc = legal_service.create_document(db, slug=slug, title=title, category=category, audience=audience, requires_acceptance=requires_acceptance)
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="conteúdo")
    return legal_service.publish_legal_version(db, version)


def test_pending_includes_unaccepted_required_public_doc(db):
    _publish(db, "termos", "Termos", "tos")
    user = _make_user(db)

    result = asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))

    assert [p["slug"] for p in result["pendingAcceptances"]] == ["termos"]


def test_pending_excludes_non_required_documents(db):
    _publish(db, "politica-retencao", "Retenção", "retention", requires_acceptance=False)
    user = _make_user(db)

    result = asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))

    assert result["pendingAcceptances"] == []


def test_pending_excludes_internal_documents_regardless_of_role(db):
    _publish(db, "acesso-administrativo", "Acesso Admin", "admin_policy", audience="internal", requires_acceptance=True)
    user = _make_user(db, role=UserRole.admin)

    result = asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))

    assert result["pendingAcceptances"] == []


def test_candidate_not_blocked_by_employer_only_document(db):
    _publish(db, "msa", "MSA", "msa", audience="employer")
    candidate = _make_user(db, role=UserRole.candidate)

    result = asyncio.run(my_pending_legal_acceptances(db=db, current_user=candidate))

    assert result["pendingAcceptances"] == []


def test_company_user_sees_both_public_and_employer_pending(db):
    _publish(db, "termos", "Termos", "tos")
    _publish(db, "termos-empregador", "Termos Empregador", "employer_tos", audience="employer")
    company_user = _make_user(db, role=UserRole.company)

    result = asyncio.run(my_pending_legal_acceptances(db=db, current_user=company_user))

    assert {p["slug"] for p in result["pendingAcceptances"]} == {"termos", "termos-empregador"}


def test_accepting_removes_it_from_pending(db):
    version = _publish(db, "termos", "Termos", "tos")
    user = _make_user(db)

    result = asyncio.run(record_my_legal_acceptance({"slug": "termos"}, _fake_request(), db=db, current_user=user))
    assert result["accepted"] is True
    assert result["versionId"] == version.id

    pending = asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))
    assert pending["pendingAcceptances"] == []

    row = db.query(LegalAcceptance).filter(LegalAcceptance.user_id == user.id).first()
    assert row.context == "reconsent"
    assert row.ip_address == "1.2.3.4"


def test_republishing_a_new_version_reintroduces_the_document_as_pending(db):
    """This is the actual re-consent trigger: an admin publishes a revised
    ToS, and everyone who already accepted the OLD version sees it as
    pending again."""
    doc_v1 = _publish(db, "termos", "Termos", "tos")
    user = _make_user(db)
    asyncio.run(record_my_legal_acceptance({"slug": "termos"}, _fake_request(), db=db, current_user=user))
    assert asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))["pendingAcceptances"] == []

    document = legal_service.get_document_by_slug(db, "termos")
    v2_draft = legal_service.create_draft_version(db, document_id=document.id, version_label="2026-08", body_markdown="v2 revista")
    legal_service.publish_legal_version(db, v2_draft)

    pending = asyncio.run(my_pending_legal_acceptances(db=db, current_user=user))
    assert [p["versionLabel"] for p in pending["pendingAcceptances"]] == ["2026-08"]


def test_accept_unknown_slug_404s(db):
    user = _make_user(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(record_my_legal_acceptance({"slug": "does-not-exist"}, _fake_request(), db=db, current_user=user))
    assert exc.value.status_code == 404


def test_accept_requires_slug(db):
    user = _make_user(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(record_my_legal_acceptance({}, _fake_request(), db=db, current_user=user))
    assert exc.value.status_code == 400
