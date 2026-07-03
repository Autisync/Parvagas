"""Tests for the admin ScrapedJob -> frontend record shape (pure, no DB)."""
import json
from types import SimpleNamespace
from datetime import datetime, timedelta

from app.api.v1.admin import _to_scraped_record, _sync_scraped_edit_to_job


def _fake_scraped(**over):
    base = dict(
        id="scraped-1", title="Credit Analyst Manager", company_name="Webcor Group",
        location="Luanda", category="Banca e Seguros", source="Ango Emprego",
        source_url="https://angoemprego.com/vagas/credit-analyst-manager/",
        status="pending", duplicate_of=None, published_job_id=None,
        application_deadline=None,
        scheduled_publish_at=None,
        description="Vaga para Credit Analyst Manager no Webcor Group.",
        responsibilities=json.dumps(["Realizar análises financeiras", "Avaliar risco de crédito"]),
        requirements=json.dumps(["Licenciatura em Finanças", "Mínimo de 5 anos de experiência"]),
        company_logo_url="https://cdn.example.com/webcor-logo.png",
        company_website="https://webcorgroup.com",
        created_at=datetime(2026, 6, 25),
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_to_scraped_record_exposes_full_structured_content():
    out = _to_scraped_record(_fake_scraped())
    assert out["description"] == "Vaga para Credit Analyst Manager no Webcor Group."
    assert out["responsibilities"] == ["Realizar análises financeiras", "Avaliar risco de crédito"]
    assert out["requirements"] == ["Licenciatura em Finanças", "Mínimo de 5 anos de experiência"]
    assert out["companyLogoUrl"] == "https://cdn.example.com/webcor-logo.png"
    assert out["companyWebsite"] == "https://webcorgroup.com"


def test_to_scraped_record_handles_missing_structured_content():
    out = _to_scraped_record(_fake_scraped(
        description=None, responsibilities=None, requirements=None,
        company_logo_url=None, company_website=None,
    ))
    assert out["description"] is None
    assert out["responsibilities"] == []
    assert out["requirements"] == []
    assert out["companyLogoUrl"] is None
    assert out["companyWebsite"] is None


def test_to_scraped_record_exposes_scheduled_publish_at():
    out = _to_scraped_record(_fake_scraped(scheduled_publish_at=datetime(2026, 8, 1, 9, 0)))
    assert out["scheduledPublishAt"] == "2026-08-01T09:00:00"


def test_to_scraped_record_scheduled_publish_at_defaults_to_none():
    out = _to_scraped_record(_fake_scraped())
    assert out["scheduledPublishAt"] is None


def _fake_job(**over):
    base = dict(
        title="old title", description="old desc", location="old loc", category="old cat",
        responsibilities=None, requirements=None,
        external_company_name="old company", external_company_logo_url=None,
        expires_at=None,
    )
    base.update(over)
    return SimpleNamespace(**base)


# ---- _sync_scraped_edit_to_job: post-publish curation must reach the live listing ----

def test_sync_only_touches_fields_that_actually_changed():
    job = _fake_job()
    s = _fake_scraped(title="new title", description="old desc")
    _sync_scraped_edit_to_job(job, s, changed_fields=["title"])
    assert job.title == "new title"
    assert job.description == "old desc"  # untouched — not in changed_fields


def test_sync_carries_responsibilities_and_requirements():
    job = _fake_job()
    s = _fake_scraped(
        responsibilities=json.dumps(["Nova responsabilidade"]),
        requirements=json.dumps(["Novo requisito"]),
    )
    _sync_scraped_edit_to_job(job, s, changed_fields=["responsibilities", "requirements"])
    assert job.responsibilities == json.dumps(["Nova responsabilidade"])
    assert job.requirements == json.dumps(["Novo requisito"])


def test_sync_maps_company_fields_to_external_prefixed_job_attrs():
    job = _fake_job()
    s = _fake_scraped(company_name="Webcor Group", company_logo_url="https://cdn.example.com/logo.png")
    _sync_scraped_edit_to_job(job, s, changed_fields=["company", "companyLogoUrl"])
    assert job.external_company_name == "Webcor Group"
    assert job.external_company_logo_url == "https://cdn.example.com/logo.png"


def test_sync_recomputes_expiry_when_deadline_changed():
    job = _fake_job()
    future_deadline = datetime.utcnow() + timedelta(days=10)
    s = _fake_scraped(application_deadline=future_deadline)
    _sync_scraped_edit_to_job(job, s, changed_fields=["applicationDeadline"])
    assert job.expires_at == future_deadline


def test_sync_does_not_touch_expiry_when_deadline_unchanged():
    job = _fake_job(expires_at=datetime(2026, 1, 1))
    s = _fake_scraped(application_deadline=datetime(2026, 12, 1))
    _sync_scraped_edit_to_job(job, s, changed_fields=["title"])
    assert job.expires_at == datetime(2026, 1, 1)
