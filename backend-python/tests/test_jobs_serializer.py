"""Tests for the public Job serializer contract (frontend shape)."""
import json
from types import SimpleNamespace
from datetime import datetime

from app.api.v1.jobs import serialize_job, _json_list, PUBLIC_JOB_STATUSES


def _fake_company():
    return SimpleNamespace(
        id="co-1", name="Acme Lda", website="https://acme.pt",
        description="We build", logo_url="/logo.png", status="active",
    )


def _fake_job(**over):
    base = dict(
        id="job-1", title="Engenheiro Backend", description="desc",
        responsibilities=json.dumps(["Construir APIs"]),
        requirements=json.dumps(["3 anos"]),
        required_skills=json.dumps(["Python", "FastAPI"]),
        preferred_skills=None, languages=None,
        location="Luanda", work_mode="Remoto", category="Tecnologia",
        contract_type="Efectivo", job_type="full_time", salary_range="200k",
        salary_min=200000, salary_max=400000,
        experience_level="Mid", required_experience_years=3,
        status="approved", visibility="public", views=42,
        spam_score=0, spam_flags=None,
        expires_at=None, published_at=None, created_at=datetime(2026, 1, 1),
        company=_fake_company(),
        external_company_name=None,
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_json_list_handles_none_and_bad_input():
    assert _json_list(None) == []
    assert _json_list("not json") == []
    assert _json_list(json.dumps(["a", "b"])) == ["a", "b"]


def test_serialize_job_summary_shape():
    out = serialize_job(_fake_job())
    assert out["_id"] == "job-1"
    assert out["title"] == "Engenheiro Backend"
    assert out["workMode"] == "Remoto" and out["mode"] == "Remoto"
    assert out["requiredSkills"] == ["Python", "FastAPI"]
    assert out["companyId"]["name"] == "Acme Lda"
    assert out["companyId"]["logo"] == "/logo.png"
    # summary must NOT include heavy fields
    assert "responsibilities" not in out
    assert "description" not in out


def test_serialize_job_detail_shape():
    out = serialize_job(_fake_job(), detail=True)
    assert out["description"] == "desc"
    assert out["responsibilities"] == ["Construir APIs"]
    assert out["requirements"] == ["3 anos"]
    assert out["createdAt"].startswith("2026-01-01")


def test_serialize_job_without_company():
    out = serialize_job(_fake_job(company=None))
    assert out["companyId"] is None


def test_public_statuses_include_approved_and_published():
    assert "approved" in PUBLIC_JOB_STATUSES
    assert "published" in PUBLIC_JOB_STATUSES


def test_serialize_job_exposes_external_company_name_for_aggregated_jobs():
    out = serialize_job(_fake_job(external_company_name="Empresa Real Lda"))
    assert out["externalCompanyName"] == "Empresa Real Lda"
    # companyId still reflects the synthetic aggregator company underneath;
    # the frontend is responsible for preferring externalCompanyName.
    assert out["companyId"]["name"] == "Acme Lda"


def test_serialize_job_external_company_name_defaults_to_none():
    out = serialize_job(_fake_job())
    assert out["externalCompanyName"] is None
