"""Auto-apply matching: scores jobs against an opted-in candidate's profile
and produces a bounded, deduplicated set of review proposals.

Design intent (see conversation/deep-research notes behind this feature):
auto-apply must be precise (multi-signal scoring, not just category) and
intentional (candidate always approves before anything is submitted — this
is a "propose then approve" queue, never a silent auto-submit). This keeps
the feature closer to the safer end of GDPR Art.22-style automated-decision
concerns (a human confirms every submission) and avoids the "spam
application" failure mode third-party auto-apply tools are criticized for.
"""
import json
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.feature_flags import get_flag
from app.models import CandidateProfile, CVUpload, Job, JobApplication, JobMatchProposal
from app.services import llm_service

settings = get_settings()

PUBLIC_JOB_STATUSES = ("approved", "published", "active")

# Minimum weighted score (0-100) for a job to be worth proposing.
MATCH_THRESHOLD = 55

# Never create more than this many new proposals for one candidate per sweep,
# and never let a candidate's pending queue exceed this — keeps the review
# queue reviewable instead of turning into its own kind of spam.
MAX_NEW_PROPOSALS_PER_RUN = 5
MAX_PENDING_PROPOSALS = 20

# Proposals nobody reviews eventually go stale — the underlying job may no
# longer be accepting applications by the time they'd be looked at.
PROPOSAL_EXPIRY_DAYS = 14


def _json_list(value: Optional[str]) -> list:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def candidate_is_eligible(db: Session, profile: CandidateProfile) -> bool:
    """Minimum-quality gate: only well-formed, CV-backed profiles are eligible
    for auto-apply. Protects employers from bare/incomplete auto-submissions
    (the "employer trust" failure mode third-party tools get criticized for)."""
    if not profile.auto_apply_opt_in:
        return False
    if not _json_list(profile.preferred_job_categories):
        return False
    has_cv = db.query(CVUpload).filter(CVUpload.candidate_id == profile.id).first() is not None
    if not has_cv:
        return False
    has_contact = bool(profile.phone and profile.location)
    return has_contact


def score_job_for_candidate(profile: CandidateProfile, job: Job) -> tuple[int, list[str]]:
    """Weighted multi-signal match score (0-100) plus human-readable reasons.

    Category is a hard prerequisite, checked by the caller before scoring —
    everything here is about *how well* a same-category job fits, not *if*
    it's the right field at all.
    """
    score = 0
    reasons: list[str] = []

    # Skills overlap (weight 40) — the single strongest fit signal.
    candidate_skills = {s.strip().lower() for s in _json_list(profile.skills) if s}
    job_skills = {s.strip().lower() for s in _json_list(job.required_skills) if s}
    if job_skills:
        overlap = candidate_skills & job_skills
        skill_ratio = len(overlap) / len(job_skills)
        score += round(skill_ratio * 40)
        if overlap:
            reasons.append(f"{len(overlap)}/{len(job_skills)} competências pedidas coincidem com o seu perfil")
    else:
        # No skills listed on the job — don't penalize, just don't award.
        score += 20

    # Experience / seniority fit (weight 20).
    if job.required_experience_years is not None and profile.years_of_experience is not None:
        gap = profile.years_of_experience - job.required_experience_years
        if gap >= 0:
            score += 20
            reasons.append("Cumpre a experiência mínima pedida")
        elif gap >= -1:
            score += 10
        # else: candidate is meaningfully under-experienced — no points.
    else:
        score += 10

    # Salary fit (weight 15).
    if profile.expected_salary_aoa and (job.salary_min or job.salary_max):
        lo = job.salary_min or 0
        hi = job.salary_max or (lo * 2 if lo else profile.expected_salary_aoa)
        if lo <= profile.expected_salary_aoa <= hi:
            score += 15
            reasons.append("Expectativa salarial dentro da faixa da vaga")
        elif profile.expected_salary_aoa < lo:
            score += 15  # candidate is willing to accept less than offered — still a fit
        # else: candidate expects more than the job pays — no points.
    else:
        score += 8

    # Work-mode / job-type fit (weight 15).
    if profile.preferred_job_type and job.work_mode:
        normalized_pref = profile.preferred_job_type.strip().lower()
        normalized_mode = job.work_mode.strip().lower()
        if normalized_pref in normalized_mode or normalized_mode in normalized_pref:
            score += 15
            reasons.append(f"Modalidade de trabalho compatível ({job.work_mode})")
    else:
        score += 8

    # Location fit (weight 10).
    if profile.location and job.location:
        if profile.location.strip().lower() in job.location.strip().lower() or job.location.strip().lower() in profile.location.strip().lower():
            score += 10
            reasons.append(f"Localização compatível ({job.location})")
    else:
        score += 5

    return min(score, 100), reasons


_LLM_SCORING_SYSTEM_PROMPT = (
    "You score how well a candidate fits a job for a job board's auto-apply "
    "matcher. You are given the candidate's profile facts, the job's facts, "
    "and a baseline heuristic score. Adjust the score only where the facts "
    "justify it and write 2-4 short reasons in PORTUGUESE (pt-AO). "
    "Ground every reason strictly in the facts given — never invent skills, "
    "employers, or requirements that aren't present. "
    "Return ONLY a JSON object: {\"score\": <int 0-100>, \"reasons\": [<string>, ...]}."
)


def _llm_refine_score(
    profile: CandidateProfile, job: Job, heuristic_score: int, heuristic_reasons: list[str],
) -> tuple[int, list[str]]:
    """Optional Llama refinement pass over the deterministic score (Phase 1,
    TEST_PLAN_CAREER_OPS.md). Falls back to the heuristic result unchanged on
    any failure — disabled flag, LLM unavailable, or a malformed/out-of-range
    response — so this can never make matching *less* reliable than before.
    """
    if not get_flag("AUTO_APPLY_LLM_SCORING_ENABLED", settings.AUTO_APPLY_LLM_SCORING_ENABLED):
        return heuristic_score, heuristic_reasons

    fallback = {"score": heuristic_score, "reasons": heuristic_reasons}
    user_prompt = json.dumps({
        "candidate": {
            "skills": _json_list(profile.skills),
            "years_of_experience": profile.years_of_experience,
            "expected_salary_aoa": profile.expected_salary_aoa,
            "preferred_job_type": profile.preferred_job_type,
            "location": profile.location,
        },
        "job": {
            "title": job.title,
            "category": job.category,
            "required_skills": _json_list(job.required_skills),
            "required_experience_years": job.required_experience_years,
            "salary_min": job.salary_min,
            "salary_max": job.salary_max,
            "work_mode": job.work_mode,
            "location": job.location,
        },
        "baseline_heuristic_score": heuristic_score,
        "baseline_heuristic_reasons": heuristic_reasons,
    }, ensure_ascii=False)

    try:
        result = llm_service.chat_json(_LLM_SCORING_SYSTEM_PROMPT, user_prompt, fallback=fallback)
    except Exception:  # noqa: BLE001 — defense in depth: chat_json shouldn't
        # raise, but a bug here must never take down the whole candidate's
        # proposal sweep (see module docstring: auto-apply must never crash).
        return heuristic_score, heuristic_reasons

    score = result.get("score")
    reasons = result.get("reasons")
    if not isinstance(score, (int, float)) or not isinstance(reasons, list):
        return heuristic_score, heuristic_reasons
    reasons = [str(r).strip() for r in reasons if str(r).strip()]
    if not reasons:
        return heuristic_score, heuristic_reasons

    return max(0, min(int(score), 100)), reasons


def generate_proposals_for_candidate(db: Session, profile: CandidateProfile) -> list[JobMatchProposal]:
    """Score newly published/updated jobs in the candidate's chosen categories
    and create proposals for the ones that clear MATCH_THRESHOLD. Never
    creates a JobApplication — that only happens when the candidate approves
    a proposal (see candidates.py approve_auto_apply_proposal)."""
    if not candidate_is_eligible(db, profile):
        return []

    pending_count = (
        db.query(JobMatchProposal)
        .filter(JobMatchProposal.candidate_id == profile.id, JobMatchProposal.status == "pending")
        .count()
    )
    if pending_count >= MAX_PENDING_PROPOSALS:
        return []

    categories = _json_list(profile.preferred_job_categories)
    already_seen_job_ids = {
        row[0]
        for row in db.query(JobMatchProposal.job_id).filter(JobMatchProposal.candidate_id == profile.id).all()
    }
    already_applied_job_ids = {
        row[0]
        for row in db.query(JobApplication.job_id).filter(JobApplication.candidate_user_id == profile.user_id).all()
    }
    exclude_ids = already_seen_job_ids | already_applied_job_ids

    since = datetime.utcnow() - timedelta(days=30)
    candidate_jobs = (
        db.query(Job)
        .filter(
            Job.status.in_(PUBLIC_JOB_STATUSES),
            Job.visibility == "public",
            Job.category.in_(categories),
            Job.published_at.isnot(None),
            Job.published_at >= since,
        )
        .order_by(Job.published_at.desc())
        .limit(200)
        .all()
    )

    created: list[JobMatchProposal] = []
    room = min(MAX_NEW_PROPOSALS_PER_RUN, MAX_PENDING_PROPOSALS - pending_count)
    for job in candidate_jobs:
        if room <= 0:
            break
        if job.id in exclude_ids:
            continue
        score, reasons = score_job_for_candidate(profile, job)
        if score < MATCH_THRESHOLD:
            continue
        # Refine only jobs that already clear the heuristic threshold — keeps
        # LLM calls off the (much larger) set of obviously-poor matches.
        score, reasons = _llm_refine_score(profile, job, score, reasons)
        if score < MATCH_THRESHOLD:
            continue
        proposal = JobMatchProposal(
            candidate_id=profile.id,
            job_id=job.id,
            match_score=score,
            match_reasons=json.dumps(reasons, ensure_ascii=True),
            status="pending",
        )
        db.add(proposal)
        created.append(proposal)
        room -= 1

    if created:
        db.commit()
        for proposal in created:
            db.refresh(proposal)

    return created


def expire_stale_proposals(db: Session) -> int:
    """Mark pending proposals older than PROPOSAL_EXPIRY_DAYS as expired."""
    cutoff = datetime.utcnow() - timedelta(days=PROPOSAL_EXPIRY_DAYS)
    stale = (
        db.query(JobMatchProposal)
        .filter(JobMatchProposal.status == "pending", JobMatchProposal.created_at < cutoff)
        .all()
    )
    for proposal in stale:
        proposal.status = "expired"
        proposal.reviewed_at = datetime.utcnow()
    if stale:
        db.commit()
    return len(stale)
