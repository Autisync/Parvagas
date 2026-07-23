"""Tests for overnight-audit W4.4 — the company profile used to be name,
logo, and one free-text paragraph, giving a candidate deciding whether to
apply almost nothing to go on. Covers the new benefits/socialLinks/gallery
fields on the profile PUT/GET round trip and the gallery upload/delete
endpoints.
"""
import asyncio
import io
import uuid

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, User, UserRole
from app.api.v1.companies import (
    get_company_profile, update_company_profile,
    upload_company_gallery_photo, delete_company_gallery_photo,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_owner_and_company(db):
    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme Angola", status="active")
    db.add(company)
    db.commit()
    return owner, company


def _upload_file(name="photo.jpg", content=b"fake-image-bytes"):
    return UploadFile(filename=name, file=io.BytesIO(content))


def test_update_profile_persists_benefits_and_social_links(db):
    owner, company = _make_owner_and_company(db)
    payload = {
        "benefits": ["Seguro de saúde", "Subsídio de transporte"],
        "socialLinks": {"linkedin": "https://linkedin.com/company/acme", "notallowed": "https://evil.example"},
    }
    asyncio.run(update_company_profile(payload, db=db, current_user=owner))

    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    profile = result["company"]
    assert profile["benefits"] == ["Seguro de saúde", "Subsídio de transporte"]
    assert profile["socialLinks"] == {"linkedin": "https://linkedin.com/company/acme"}


def test_update_profile_clears_social_links_when_all_removed(db):
    owner, company = _make_owner_and_company(db)
    asyncio.run(update_company_profile({"socialLinks": {"linkedin": "https://linkedin.com/company/acme"}}, db=db, current_user=owner))
    asyncio.run(update_company_profile({"socialLinks": {}}, db=db, current_user=owner))

    result = asyncio.run(get_company_profile(db=db, current_user=owner))
    assert result["company"]["socialLinks"] == {}


def test_gallery_upload_appends_and_caps_at_limit(db, monkeypatch):
    monkeypatch.setattr("app.api.v1.companies.StorageService.save_file", lambda content, name: f"local:{name}")
    owner, company = _make_owner_and_company(db)
    for _ in range(6):
        result = asyncio.run(upload_company_gallery_photo(_upload_file(), db=db, current_user=owner))
    assert len(result["galleryPhotos"]) == 6

    with pytest.raises(HTTPException) as exc:
        asyncio.run(upload_company_gallery_photo(_upload_file(), db=db, current_user=owner))
    assert exc.value.status_code == 400


def test_gallery_delete_removes_by_index(db, monkeypatch):
    monkeypatch.setattr("app.api.v1.companies.StorageService.save_file", lambda content, name: f"local:{name}")
    owner, company = _make_owner_and_company(db)
    asyncio.run(upload_company_gallery_photo(_upload_file("a.jpg"), db=db, current_user=owner))
    asyncio.run(upload_company_gallery_photo(_upload_file("b.jpg"), db=db, current_user=owner))

    result = asyncio.run(delete_company_gallery_photo(0, db=db, current_user=owner))
    assert len(result["galleryPhotos"]) == 1


def test_gallery_delete_out_of_range_404s(db):
    owner, company = _make_owner_and_company(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(delete_company_gallery_photo(0, db=db, current_user=owner))
    assert exc.value.status_code == 404


def test_gallery_upload_rejects_unsupported_extension(db):
    owner, company = _make_owner_and_company(db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(upload_company_gallery_photo(_upload_file("photo.exe"), db=db, current_user=owner))
    assert exc.value.status_code == 400
