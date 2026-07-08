"""Golden-set eval for the Llama auto-apply scoring refinement (Phase 1,
TEST_PLAN_CAREER_OPS.md checklist item: "assert Llama scores land in the
expected band; re-run after any prompt edit").

This calls a REAL LLM — it only runs when one is actually reachable (set
RUN_LLM_GOLDEN_TESTS=1 with Ollama/another provider configured), so it never
blocks the normal test suite in an environment without a model. This is
intentionally separate from test_auto_apply_llm_scoring.py, which covers the
fallback/validation logic with a mocked LLM and always runs.
"""
import json
import os
import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest

from app.services.auto_apply_service import _llm_refine_score
from app.services import llm_service

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LLM_GOLDEN_TESTS") != "1" or not llm_service.llm_enabled(),
    reason="Golden-set eval needs a live LLM — set RUN_LLM_GOLDEN_TESTS=1 with LLM_ENABLED configured",
)


def _candidate(**kw):
    defaults = dict(
        id=str(uuid.uuid4()), user_id=str(uuid.uuid4()), phone="+244900000000", location="Luanda",
        skills=json.dumps(["Python", "SQL", "Django"]), years_of_experience=5,
        expected_salary_aoa=350000, preferred_job_type="remoto",
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _job(**kw):
    defaults = dict(
        id=str(uuid.uuid4()), title="Engenheiro de Software Backend", category="Tecnologia",
        required_skills=json.dumps(["Python", "SQL"]), required_experience_years=3,
        salary_min=300000, salary_max=450000, work_mode="Remoto", location="Luanda",
        published_at=datetime.utcnow(),
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


# (candidate, job, expected_band) — band is a (min, max) the refined score
# should land in given the heuristic baseline is a strong-but-imperfect 60.
GOLDEN_SET = [
    (
        "strong_match_same_stack",
        _candidate(skills=json.dumps(["Python", "SQL", "Django", "Docker"])),
        _job(required_skills=json.dumps(["Python", "SQL"])),
        (60, 100),
    ),
    (
        "borderline_partial_skills",
        _candidate(skills=json.dumps(["Python"]), years_of_experience=1),
        _job(required_skills=json.dumps(["Python", "Kubernetes", "Go"]), required_experience_years=5),
        (0, 70),
    ),
    (
        "clearly_wrong_field",
        _candidate(skills=json.dumps(["Python"]), preferred_job_type="remoto"),
        _job(category="Saude", required_skills=json.dumps(["Enfermagem", "Primeiros Socorros"]), work_mode="Presencial", location="Huambo"),
        (0, 40),
    ),
]


@pytest.mark.parametrize("name,candidate,job,band", GOLDEN_SET, ids=[g[0] for g in GOLDEN_SET])
def test_golden_pair_lands_in_expected_band(name, candidate, job, band):
    baseline_score = 60
    baseline_reasons = ["heuristic baseline"]
    score, reasons = _llm_refine_score(candidate, job, baseline_score, baseline_reasons)
    lo, hi = band
    assert lo <= score <= hi, f"{name}: score {score} outside expected band {band}"
    assert reasons, f"{name}: refinement produced no reasons"
