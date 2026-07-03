"""Tests for the scraped-job quality/completeness gate (pure, no DB)."""
from app.services.scraper_service import assess_scraped_job_quality, MIN_QUALITY_DESCRIPTION_CHARS


def test_fully_curated_listing_scores_zero():
    score, flags = assess_scraped_job_quality(
        title="Credit Analyst Manager",
        description="A" * (MIN_QUALITY_DESCRIPTION_CHARS + 10),
        company_name="Webcor Group",
        has_responsibilities=True,
        has_requirements=True,
    )
    assert score == 0
    assert flags == []


def test_missing_description_flagged_heavily():
    score, flags = assess_scraped_job_quality(
        title="Vaga", description=None, company_name="Empresa",
    )
    assert "sem descrição" in flags
    assert score >= 30


def test_thin_description_flagged():
    score, flags = assess_scraped_job_quality(
        title="Vaga", description="Uma vaga interessante.", company_name="Empresa",
    )
    assert "descrição muito curta" in flags
    assert score > 0


def test_missing_company_flagged():
    score, flags = assess_scraped_job_quality(
        title="Vaga", description="A" * 100, company_name=None,
    )
    assert "sem nome de empresa" in flags


def test_missing_structured_content_flagged():
    score, flags = assess_scraped_job_quality(
        title="Vaga", description="A" * 100, company_name="Empresa",
        has_responsibilities=False, has_requirements=False,
    )
    assert "sem responsabilidades/requisitos" in flags


def test_structured_content_present_avoids_that_flag():
    _, flags = assess_scraped_job_quality(
        title="Vaga", description="A" * 100, company_name="Empresa",
        has_responsibilities=True, has_requirements=False,
    )
    assert "sem responsabilidades/requisitos" not in flags


def test_scam_pattern_detected_same_as_company_job_moderation():
    # "trabalhe" (not "trabalho") to match the shared _SCAM_PATTERNS regex
    # verbatim-copied from companies._spam_assessment.
    score, flags = assess_scraped_job_quality(
        title="Trabalhe em casa sem experiencia",
        description="Contacte via whatsapp e pague uma taxa de inscrição.",
        company_name="Empresa",
    )
    assert score == 100  # capped
    assert len(flags) >= 2


def test_score_is_capped_at_100():
    score, _ = assess_scraped_job_quality(title=None, description=None, company_name=None)
    assert 0 <= score <= 100
