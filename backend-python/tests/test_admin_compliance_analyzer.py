"""Tests for the compliance analyzer admin endpoints (Wave L3b) — the
checklist -> findings mapping against real (seeded-in-test) legal
documents, severity escalation when a referenced document doesn't exist,
super-admin gating on writes, and resolve/dismiss lifecycle.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ComplianceCheck, LegalDocument, LegalDocumentVersion, User, UserRole
from app.services import legal_service
from app.api.v1.admin import (
    admin_create_compliance_check,
    admin_dismiss_compliance_check,
    admin_get_compliance_check,
    admin_list_compliance_categories,
    admin_list_compliance_checks,
    admin_resolve_compliance_check,
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


def _publish(db, slug, title, category, audience="public"):
    doc = legal_service.create_document(db, slug=slug, title=title, category=category, audience=audience)
    version = legal_service.create_draft_version(db, document_id=doc.id, version_label="2026-07", body_markdown="conteúdo")
    legal_service.publish_legal_version(db, version)
    return doc


def test_list_categories_is_public_to_any_admin(db):
    admin = _make_admin(db, admin_level="moderator")
    result = asyncio.run(admin_list_compliance_categories(current_user=admin))
    keys = {c["key"] for c in result["categories"]}
    assert "new_subprocessor" in keys
    assert "ai_automated_decision" in keys
    assert len(keys) == 10


def test_create_check_requires_super_admin(db):
    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_compliance_check(
            {"featureName": "X", "featureDescription": "Y", "intake": {}}, db=db, current_user=moderator,
        ))
    assert exc.value.status_code == 403
    assert db.query(ComplianceCheck).count() == 0


def test_create_check_with_no_flags_is_severity_none(db):
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_compliance_check(
        {"featureName": "Novo botão de partilha", "featureDescription": "Adiciona um botão de partilha social a uma vaga.", "intake": {}},
        db=db, current_user=admin,
    ))
    assert result["severitySummary"] == "none"
    assert result["findings"] == []
    assert result["status"] == "open"


def test_create_check_flags_new_subprocessor_against_real_docs(db):
    _publish(db, "privacidade", "Política de Privacidade", "privacy")
    _publish(db, "dpa", "DPA", "dpa", audience="employer")
    admin = _make_super_admin(db)

    result = asyncio.run(admin_create_compliance_check(
        {
            "featureName": "Novo fornecedor de OCR",
            "featureDescription": "Passamos a usar um novo serviço externo para ler CVs digitalizados.",
            "intake": {"new_subprocessor": True},
        },
        db=db, current_user=admin,
    ))

    assert result["severitySummary"] == "high"
    finding = result["findings"][0]
    assert finding["category"] == "new_subprocessor"
    doc_slugs = {d["slug"]: d["status"] for d in finding["documents"]}
    assert doc_slugs == {"privacidade": "published", "dpa": "published"}


def test_create_check_escalates_when_referenced_document_is_missing(db):
    """cookies.md was never created in this DB — the analyzer must flag
    that as a concrete gap (missing document), not silently ignore it."""
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_compliance_check(
        {
            "featureName": "Novo pixel de analytics",
            "featureDescription": "Adiciona um novo cookie de analytics à página de vagas.",
            "intake": {"cookie_tracking_change": True},
        },
        db=db, current_user=admin,
    ))
    # cookie_tracking_change is normally "low" severity, but escalates to
    # "high" because the cookies document doesn't exist in this DB yet.
    assert result["severitySummary"] == "high"
    finding = result["findings"][0]
    assert finding["documents"][0]["status"] == "missing"


def test_create_check_ignores_unknown_intake_keys(db):
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_compliance_check(
        {"featureName": "X", "featureDescription": "Y", "intake": {"not_a_real_category": True}},
        db=db, current_user=admin,
    ))
    assert result["findings"] == []
    assert result["intake"] == {}


def test_multiple_flags_take_highest_severity(db):
    _publish(db, "cookies", "Cookies", "cookies")
    admin = _make_super_admin(db)
    result = asyncio.run(admin_create_compliance_check(
        {
            "featureName": "Funcionalidade grande",
            "featureDescription": "Descrição.",
            "intake": {"cookie_tracking_change": True, "minors_or_age": True},  # low + high
        },
        db=db, current_user=admin,
    ))
    assert result["severitySummary"] == "high"
    assert len(result["findings"]) == 2


def test_list_and_get_and_filter_by_status(db):
    admin = _make_super_admin(db)
    asyncio.run(admin_create_compliance_check({"featureName": "A", "featureDescription": "d", "intake": {}}, db=db, current_user=admin))
    created = asyncio.run(admin_create_compliance_check({"featureName": "B", "featureDescription": "d", "intake": {}}, db=db, current_user=admin))

    all_checks = asyncio.run(admin_list_compliance_checks(status_filter=None, db=db, current_user=admin))
    assert len(all_checks["complianceChecks"]) == 2

    detail = asyncio.run(admin_get_compliance_check(created["_id"], db=db, current_user=admin))
    assert detail["featureName"] == "B"

    open_only = asyncio.run(admin_list_compliance_checks(status_filter="open", db=db, current_user=admin))
    assert len(open_only["complianceChecks"]) == 2


def test_resolve_and_dismiss_lifecycle(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_compliance_check({"featureName": "A", "featureDescription": "d", "intake": {}}, db=db, current_user=admin))

    resolved = asyncio.run(admin_resolve_compliance_check(created["_id"], db=db, current_user=admin))
    assert resolved["status"] == "resolved"
    assert resolved["resolvedAt"] is not None

    created2 = asyncio.run(admin_create_compliance_check({"featureName": "B", "featureDescription": "d", "intake": {}}, db=db, current_user=admin))
    dismissed = asyncio.run(admin_dismiss_compliance_check(created2["_id"], db=db, current_user=admin))
    assert dismissed["status"] == "dismissed"


def test_resolve_requires_super_admin(db):
    admin = _make_super_admin(db)
    created = asyncio.run(admin_create_compliance_check({"featureName": "A", "featureDescription": "d", "intake": {}}, db=db, current_user=admin))

    moderator = _make_admin(db, admin_level="moderator")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_resolve_compliance_check(created["_id"], db=db, current_user=moderator))
    assert exc.value.status_code == 403
