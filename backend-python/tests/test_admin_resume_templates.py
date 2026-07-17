"""Tests for admin resume-template CRUD — ResumeTemplate rows are metadata
only; the actual rendering logic is a code-level registry keyed by slug
(app/services/resume_render_service.py's TEMPLATES dict), so creation is
restricted to slugs already registered there.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ResumeTemplate, User, UserRole
from app.api.v1.admin import (
    admin_list_resume_templates,
    admin_create_resume_template,
    admin_update_resume_template,
)


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


def test_list_includes_inactive_templates(db):
    admin = _make_admin(db)
    db.add(ResumeTemplate(slug="ats-classic", name="ATS Classic", is_active=True))
    db.add(ResumeTemplate(slug="moderno", name="Moderno", is_active=False))
    db.commit()

    result = asyncio.run(admin_list_resume_templates(db=db, current_user=admin))

    slugs = {t["slug"] for t in result["resumeTemplates"]}
    assert slugs == {"ats-classic", "moderno"}
    inactive = [t for t in result["resumeTemplates"] if t["slug"] == "moderno"][0]
    assert inactive["isActive"] is False
    assert "ats-classic" in result["availableSlugs"]
    assert "moderno" in result["availableSlugs"]
    assert "executivo" in result["availableSlugs"]


def test_create_rejects_unknown_slug(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_resume_template({"slug": "made-up", "name": "Fake"}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_create_rejects_duplicate_slug(db):
    admin = _make_admin(db)
    db.add(ResumeTemplate(slug="ats-classic", name="ATS Classic", is_active=True))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_create_resume_template({"slug": "ats-classic", "name": "Dup"}, db=db, current_user=admin))
    assert exc.value.status_code == 400


def test_create_succeeds_for_valid_registry_slug(db):
    admin = _make_admin(db)
    result = asyncio.run(admin_create_resume_template({"slug": "executivo", "name": "Executivo"}, db=db, current_user=admin))

    assert result["slug"] == "executivo"
    assert result["name"] == "Executivo"
    assert result["isActive"] is True
    row = db.query(ResumeTemplate).filter(ResumeTemplate.slug == "executivo").first()
    assert row is not None


def test_update_edits_metadata_without_touching_slug(db):
    admin = _make_admin(db)
    entry = ResumeTemplate(slug="moderno", name="Moderno", description="old", is_active=True)
    db.add(entry)
    db.commit()

    result = asyncio.run(admin_update_resume_template(
        entry.id,
        {"name": "Moderno v2", "description": "new", "isActive": False},
        db=db,
        current_user=admin,
    ))

    assert result["slug"] == "moderno"
    assert result["name"] == "Moderno v2"
    assert result["description"] == "new"
    assert result["isActive"] is False


def test_update_404_for_missing_id(db):
    admin = _make_admin(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_update_resume_template("does-not-exist", {"name": "x"}, db=db, current_user=admin))
    assert exc.value.status_code == 404
