"""Tests for the admin ScrapedJob -> frontend record shape (pure, no DB)."""
import json
from types import SimpleNamespace
from datetime import datetime

from app.api.v1.admin import _to_scraped_record


def _fake_scraped(**over):
    base = dict(
        id="scraped-1", title="Credit Analyst Manager", company_name="Webcor Group",
        location="Luanda", category="Banca e Seguros", source="Ango Emprego",
        source_url="https://angoemprego.com/vagas/credit-analyst-manager/",
        status="pending", duplicate_of=None, published_job_id=None,
        application_deadline=None,
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
