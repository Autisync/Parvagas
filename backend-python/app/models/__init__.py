"""SQLAlchemy models for core database schema."""
from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.db.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    """User role enumeration."""
    candidate = "candidate"
    company = "company"
    recruiter = "recruiter"
    admin = "admin"
    super_admin = "super_admin"


class AdminLevel(str, enum.Enum):
    """Administrative privilege level enumeration."""
    moderator = "moderator"
    super_admin = "super-admin"


class User(Base, TimestampMixin):
    """User account model."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.candidate)
    admin_level = Column(String(32), nullable=False, default=AdminLevel.moderator.value)
    
    # Phone (mobile-first market: phone/OTP login)
    phone = Column(String(20), nullable=True, index=True)
    phone_verified = Column(Boolean, nullable=False, default=False)

    # Email verification
    email_verified = Column(Boolean, nullable=False, default=False)
    email_verified_at = Column(DateTime, nullable=True)
    
    # Status
    suspended = Column(Boolean, nullable=False, default=False)

    # Tokens
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    # Access tokens issued with an `iat` before this are rejected by
    # get_current_user — lets an admin force-logout a still-valid session
    # without shortening everyone else's token TTL.
    tokens_revoked_at = Column(DateTime, nullable=True)

    # Guest shadow accounts (C5, EXECUTION_PLAN_NATIVE_CV_BUILDER.md) — set
    # true by the guest CV-drop / CV-builder-guest-start flows (a random,
    # never-shown password is generated); flips false the moment the
    # candidate actually sets a password via AuthService.reset_password.
    is_guest_account = Column(Boolean, nullable=False, default=False)
    guest_claim_email_sent_at = Column(DateTime, nullable=True)
    # Set once, the moment a guest account converts (is_guest_account flips
    # True -> False) — never cleared, so it's a durable marker letting the
    # admin dashboard compute a real guest->registered conversion rate
    # instead of only ever seeing the current (post-conversion) state.
    guest_converted_at = Column(DateTime, nullable=True)

    # Have I Been Pwned daily breach scan — when this email was last checked
    # against the HIBP v3 breach API (app.services.hibp_service). Oldest /
    # never-checked accounts go first each run.
    hibp_checked_at = Column(DateTime, nullable=True)


    # Relations
    candidate_profile = relationship("CandidateProfile", back_populates="user", uselist=False)
    company = relationship("Company", back_populates="owner", uselist=False, foreign_keys="Company.owner_user_id")


class CandidateProfile(Base, TimestampMixin):
    """Candidate profile model."""
    __tablename__ = "candidate_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, unique=True)
    
    # Personal info
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    location = Column(String(255), nullable=True)
    postcode = Column(String(20), nullable=True)
    
    # URLs
    linkedin_url = Column(String(500), nullable=True)
    portfolio_url = Column(String(500), nullable=True)
    github_url = Column(String(500), nullable=True)
    
    # Profile
    professional_summary = Column(Text, nullable=True)
    job_title = Column(String(255), nullable=True)
    years_of_experience = Column(Integer, nullable=True)
    
    # Skills (flat combined list kept for backward compat; split buckets below)
    skills = Column(Text, nullable=True)  # JSON array as string
    # Split skill buckets populated by the rules-first parser (added 2026-06-29).
    hard_skills = Column(Text, nullable=True)   # JSON array as string
    techniques = Column(Text, nullable=True)    # JSON array as string
    tools = Column(Text, nullable=True)         # JSON array as string

    # Experience
    work_experience = Column(Text, nullable=True)  # JSON array as string
    education = Column(Text, nullable=True)  # JSON array as string
    certifications = Column(Text, nullable=True)  # JSON array as string
    languages = Column(Text, nullable=True)  # JSON array as string

    # Job preferences (added 2026-06-30)
    preferred_job_type = Column(String(50), nullable=True)   # tempo_integral | remoto | ...
    expected_salary_aoa = Column(Integer, nullable=True)     # monthly expectation, AOA
    availability = Column(String(50), nullable=True)         # imediata | 1_semana | ...

    # Auto-apply preferences (added 2026-07-06). auto_apply_opt_in only records
    # candidate intent today — the matching/auto-submission engine itself is a
    # future paid feature and is not implemented yet.
    preferred_job_categories = Column(Text, nullable=True)   # JSON array of category strings
    auto_apply_opt_in = Column(Boolean, nullable=False, default=False)

    # Onboarding
    has_completed_onboarding = Column(Boolean, nullable=False, default=False)
    has_seen_tutorial = Column(Boolean, nullable=False, default=False)

    # Notification channel opt-in/out (GET/PATCH /candidates/notifications/
    # preferences) — JSON object, e.g. {"emailJobAlerts": true, ...}. Missing
    # keys fall back to _DEFAULT_PREFS in candidates.py, so this column only
    # ever needs to store what the candidate actually changed.
    notification_preferences = Column(Text, nullable=True)

    # Relations
    user = relationship("User", back_populates="candidate_profile")
    cv_uploads = relationship("CVUpload", back_populates="candidate_profile")
    resumes = relationship("Resume", back_populates="candidate_profile")


class Company(Base, TimestampMixin):
    """Company profile model."""
    __tablename__ = "companies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Basic info
    name = Column(String(255), nullable=False)
    legal_name = Column(String(255), nullable=True)
    nif = Column(String(50), nullable=True, unique=True)
    
    # Contact
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(500), nullable=True)
    
    # Status
    status = Column(String(50), nullable=False, default="pending_verification")
    
    # Description
    description = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)

    # Onboarding
    has_seen_tutorial = Column(Boolean, nullable=False, default=False)

    # Angola differentiator: commits to the 70% national-hiring rule (Angolanização).
    angolanizacao = Column(Boolean, nullable=False, default=False)

    # Relations
    owner = relationship("User", back_populates="company", foreign_keys=[owner_user_id])


class CVUpload(Base, TimestampMixin):
    """CV upload and parsing history."""
    __tablename__ = "cv_uploads"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False)
    
    # File info
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    
    # Parsing
    raw_text = Column(Text, nullable=True)
    parsed_data = Column(Text, nullable=True)  # JSON
    parse_confidence = Column(Float, nullable=True)
    parse_status = Column(String(50), nullable=False, default="pending")
    parse_error = Column(Text, nullable=True)
    
    # Marking
    is_primary = Column(Boolean, nullable=False, default=False)
    
    # Relations
    candidate_profile = relationship("CandidateProfile", back_populates="cv_uploads")


class ResumeTemplate(Base, TimestampMixin):
    """Resume template metadata for candidate resume building."""
    __tablename__ = "resume_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    preview_url = Column(String(500), nullable=True)
    schema = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    resumes = relationship("Resume", back_populates="template")


class Resume(Base, TimestampMixin):
    """Candidate resume model with version history and template metadata."""
    __tablename__ = "resumes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_profile_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    template_id = Column(String(36), ForeignKey("resume_templates.id"), nullable=True)
    data = Column(Text, nullable=True)
    is_draft = Column(Boolean, nullable=False, default=True)
    is_published = Column(Boolean, nullable=False, default=False)
    share_slug = Column(String(100), nullable=True, unique=True)

    candidate_profile = relationship("CandidateProfile", back_populates="resumes")
    template = relationship("ResumeTemplate", back_populates="resumes")
    versions = relationship("ResumeVersion", back_populates="resume", cascade="all, delete-orphan")


class ResumeVersion(Base, TimestampMixin):
    """Stored resume version history."""
    __tablename__ = "resume_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    resume_id = Column(String(36), ForeignKey("resumes.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, default=1)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    data = Column(Text, nullable=True)
    change_summary = Column(Text, nullable=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    resume = relationship("Resume", back_populates="versions")
    created_by = relationship("User")


class CoverLetter(Base, TimestampMixin):
    """Cover letters generated or created by candidates."""
    __tablename__ = "cover_letters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_profile_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False)
    resume_id = Column(String(36), ForeignKey("resumes.id"), nullable=True)
    job_id = Column(String(36), nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    language = Column(String(50), nullable=True)
    is_draft = Column(Boolean, nullable=False, default=True)
    is_published = Column(Boolean, nullable=False, default=False)

    candidate_profile = relationship("CandidateProfile")
    resume = relationship("Resume")


class CandidateScore(Base, TimestampMixin):
    """Resume scoring and ATS score records."""
    __tablename__ = "candidate_scores"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_profile_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False)
    resume_id = Column(String(36), ForeignKey("resumes.id"), nullable=True)
    overall_score = Column(Float, nullable=True)
    skills_score = Column(Float, nullable=True)
    experience_score = Column(Float, nullable=True)
    formatting_score = Column(Float, nullable=True)
    ats_score = Column(Float, nullable=True)
    score_metadata = Column(Text, nullable=True)

    candidate_profile = relationship("CandidateProfile")
    resume = relationship("Resume")


class ATSStage(Base, TimestampMixin):
    """ATS pipeline stage definitions."""
    __tablename__ = "ats_stages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    position = Column(Integer, nullable=False, default=0)
    color = Column(String(50), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)

    company = relationship("Company")
    pipeline_items = relationship("ATSPipelineItem", back_populates="stage", cascade="all, delete-orphan")


class ATSPipelineItem(Base, TimestampMixin):
    """ATS pipeline item linking candidates/applications to stages."""
    __tablename__ = "ats_pipeline_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    stage_id = Column(String(36), ForeignKey("ats_stages.id"), nullable=False)
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=True)
    candidate_profile_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="active")

    stage = relationship("ATSStage", back_populates="pipeline_items")
    candidate_profile = relationship("CandidateProfile")
    application = relationship("JobApplication")


class RefreshToken(Base, TimestampMixin):
    """Refresh token records for JWT token refresh flows."""
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)

    user = relationship("User")

    user = relationship("User")

    user = relationship("User")


class JobApplication(Base, TimestampMixin):
    """Job application submitted by authenticated or guest candidates."""
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), nullable=False, index=True)
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    candidate_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    applicant_full_name = Column(String(255), nullable=False)
    applicant_email = Column(String(255), nullable=False, index=True)
    applicant_phone = Column(String(20), nullable=True)
    applicant_location = Column(String(255), nullable=True)

    cover_letter = Column(Text, nullable=True)
    profile_source = Column(String(50), nullable=False, default="manual")
    status = Column(String(50), nullable=False, default="submitted")

    cv_file_path = Column(String(500), nullable=True)
    saved_cv_document_id = Column(String(36), nullable=True)
    # A native Construtor de CV resume (D1, EXECUTION_PLAN_NATIVE_CV_
    # BUILDER.md) — an alternative to the two fields above, rendered
    # on-demand rather than a stored file, so no matching *_path column.
    resume_id = Column(String(36), nullable=True, index=True)

    # Lets a guest applicant (no account) check this one application's status
    # without logging in — issued at submission time, sent in the
    # confirmation email. Authenticated candidates track via the portal
    # instead, so this stays null for those applications.
    tracking_token = Column(String(64), nullable=True, unique=True, index=True)


class JobMatchProposal(Base, TimestampMixin):
    """A candidate-reviewable auto-apply match, produced by the periodic
    matching sweep (see app.services.auto_apply_service). Nothing is ever
    submitted to an employer until the candidate explicitly approves the
    proposal — this is a "propose then approve" queue, not a silent
    auto-submit, by design (see PLANO_EXECUCAO_MERCADO.md / auto-apply
    research notes: candidate intent must stay an explicit, auditable act)."""
    __tablename__ = "job_match_proposals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False, index=True)

    match_score = Column(Integer, nullable=False, default=0)
    match_reasons = Column(Text, nullable=True)  # JSON array of human-readable reason strings

    # pending | approved | dismissed | expired
    status = Column(String(20), nullable=False, default="pending", index=True)
    reviewed_at = Column(DateTime, nullable=True)
    resulting_application_id = Column(String(36), nullable=True)


class LlmCallLog(Base, TimestampMixin):
    """One row per call through app.services.llm_service — the shared LLM
    invocation layer every AI feature (auto-apply scoring, CV keyword
    injection, resume rewrite free/paid tiers) goes through. Written by
    llm_service.chat_json_request(), the single low-level HTTP path every
    caller funnels through, so this captures usage regardless of which
    feature or provider triggered the call."""
    __tablename__ = "llm_call_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feature = Column(String(60), nullable=False, index=True)
    provider = Column(String(40), nullable=False, default="unknown")
    model = Column(String(120), nullable=True)
    success = Column(Boolean, nullable=False, default=False)


class AdCampaign(Base, TimestampMixin):
    """Ad campaign model used by admin and public placements."""
    __tablename__ = "ad_campaigns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    placement = Column(String(100), nullable=False, index=True)
    link = Column(String(1000), nullable=True)
    image_url = Column(Text, nullable=True)

    # Lifecycle and moderation state
    status = Column(String(50), nullable=False, default="draft")
    active = Column(Boolean, nullable=False, default=True)
    flagged = Column(Boolean, nullable=False, default=False)
    flag_reason = Column(Text, nullable=True)
    pause_reason = Column(Text, nullable=True)

    # Budget/performance
    budget = Column(Float, nullable=True)              # total spend cap (same unit as cost_*)
    cost_per_click = Column(Float, nullable=False, default=0)
    cost_per_impression = Column(Float, nullable=False, default=0)
    clicks = Column(Integer, nullable=False, default=0)
    impressions = Column(Integer, nullable=False, default=0)

    # Optional targeting (empty = show everywhere for the placement)
    target_category = Column(String(100), nullable=True)
    target_location = Column(String(255), nullable=True)

    # Delivery window
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    last_served_at = Column(DateTime, nullable=True)


class CareerPost(Base, TimestampMixin):
    """Editorial career-tips / blog article, managed via the admin console.

    ``body`` and ``takeaways`` are stored as JSON-encoded string arrays (the
    serializer parses them back into lists). ``slug`` is the public URL key.
    """
    __tablename__ = "career_posts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(255), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    excerpt = Column(Text, nullable=True)
    read_time = Column(String(50), nullable=True)
    author = Column(String(255), nullable=True)
    cover_image = Column(Text, nullable=True)
    body = Column(Text, nullable=True)        # JSON array of paragraphs
    takeaways = Column(Text, nullable=True)   # JSON array of bullet points

    featured_on_home = Column(Boolean, nullable=False, default=False)
    published = Column(Boolean, nullable=False, default=True)
    published_at = Column(DateTime, nullable=True)


class EmailVerificationToken(Base, TimestampMixin):
    """Email verification tokens."""
    __tablename__ = "email_verification_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)


class PasswordResetToken(Base, TimestampMixin):
    """Password reset tokens."""
    __tablename__ = "password_reset_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)


class Job(Base, TimestampMixin):
    """Job posting created by a company and browsed publicly."""
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # List/array fields stored as JSON strings (see candidates pattern).
    responsibilities = Column(Text, nullable=True)
    requirements = Column(Text, nullable=True)
    required_skills = Column(Text, nullable=True)
    preferred_skills = Column(Text, nullable=True)
    languages = Column(Text, nullable=True)

    location = Column(String(255), nullable=True, index=True)
    work_mode = Column(String(50), nullable=True)        # Presencial | Remoto | Híbrido | Rotativo
    category = Column(String(100), nullable=True, index=True)
    contract_type = Column(String(50), nullable=True)
    job_type = Column(String(50), nullable=True)
    salary_range = Column(String(255), nullable=True)
    experience_level = Column(String(50), nullable=True)
    required_experience_years = Column(Integer, nullable=True)

    # Moderation / visibility
    status = Column(String(50), nullable=False, default="pending_platform_review", index=True)
    visibility = Column(String(50), nullable=False, default="public")
    moderation_reason = Column(Text, nullable=True)
    featured = Column(Boolean, nullable=False, default=False)

    expires_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)

    # Search facets / analytics / trust
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    views = Column(Integer, nullable=False, default=0)
    spam_score = Column(Integer, nullable=False, default=0)
    spam_flags = Column(Text, nullable=True)  # JSON array of reasons

    # Aggregation attribution (set when published from a scraped/external source).
    # `company_id` always points at the synthetic "Parvagas Aggregator" company for
    # these listings, so the real hiring company name has nowhere else to live.
    source = Column(String(100), nullable=True)
    source_url = Column(String(1000), nullable=True)
    external_company_name = Column(String(255), nullable=True)
    external_company_logo_url = Column(Text, nullable=True)
    # Real hiring company's inbox for jobs with no Parvagas company account
    # (aggregated/scraped listings, admin-set). When present, new applications
    # are emailed straight there instead of only reaching an internal admin.
    external_contact_email = Column(String(255), nullable=True)
    # Lets that no-account employer view applications for THIS job without
    # logging in — issued once, sent in the notification email.
    employer_access_token = Column(String(64), nullable=True, unique=True, index=True)

    company = relationship("Company", foreign_keys=[company_id])


class SavedJob(Base, TimestampMixin):
    """A job bookmarked by a candidate."""
    __tablename__ = "saved_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False, index=True)


class JobAlert(Base, TimestampMixin):
    """Saved search that notifies a candidate of new matching jobs."""
    __tablename__ = "job_alerts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    keyword = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    work_mode = Column(String(50), nullable=True)
    frequency = Column(String(20), nullable=False, default="daily")  # instant | daily | weekly
    active = Column(Boolean, nullable=False, default=True)
    last_notified_at = Column(DateTime, nullable=True)


class CompanyMember(Base, TimestampMixin):
    """A user with a seat on a company (mini-ATS collaboration)."""
    __tablename__ = "company_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(30), nullable=False, default="recruiter")  # owner | recruiter | viewer


class CompanyInvite(Base, TimestampMixin):
    """Pending invitation for a user to join a company."""
    __tablename__ = "company_invites"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(30), nullable=False, default="recruiter")
    token_hash = Column(String(255), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | accepted | revoked
    expires_at = Column(DateTime, nullable=False)


class CompanyDeletionRequest(Base, TimestampMixin):
    """A moderator's request to delete/reject a company, pending super-admin
    approval. Replaces the old in-memory `_deletion_requests` list in
    companies.py, which was wiped on every restart and not shared across
    worker processes — this table is the durable version of the same
    workflow the admin Companies page already drives."""
    __tablename__ = "company_deletion_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    requested_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    requested_by_admin_level = Column(String(20), nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="pending_admin_approval")  # pending_admin_approval | approved | rejected
    reviewed_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)


class ApplicationNote(Base, TimestampMixin):
    """Recruiter note / rating on an application (ATS)."""
    __tablename__ = "application_notes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    author_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)  # 1..5


class AuditLog(Base, TimestampMixin):
    """Durable record of privileged/admin actions."""
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_user_id = Column(String(36), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)  # JSON


class Notification(Base, TimestampMixin):
    """In-app notification shown in the portal header bell."""
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False, default="general")  # application_status | job | system | ...
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String(500), nullable=True)
    read_at = Column(DateTime, nullable=True)


class SupportMessage(Base, TimestampMixin):
    """A message sent via the notification bell's "message" form. Despite
    the frontend calling this "company-admin-message", it's actually a
    non-owner company team member messaging their own company's OWNER
    (see NotificationBell.tsx's "Mensagem interna ao owner" label and the
    nonOwnerCompanyUser gate) — not a message to platform admins. Previously
    this endpoint faked a response and persisted nothing, so it reached no
    one either way.

    `recipient_user_id` is resolved server-side (the company owner, when the
    sender is a non-owner team member) and set on this row alongside the
    Notification it triggers. Falls back to every platform admin (recipient_
    user_id left null) if no company owner can be resolved, so the form
    still does something sane for any other caller."""
    __tablename__ = "support_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    sender_role = Column(String(20), nullable=True)
    recipient_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    reason = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open")  # open | resolved


class NewsletterSubscriber(Base, TimestampMixin):
    """Public email opt-in for job-openings / platform news announcements."""
    __tablename__ = "newsletter_subscribers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=False, unique=True, index=True)
    source = Column(String(50), nullable=True)  # e.g. "footer", "signup"
    unsubscribed_at = Column(DateTime, nullable=True)


class ScrapedJob(Base, TimestampMixin):
    """External job listing ingested for curation into the public board."""
    __tablename__ = "scraped_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source = Column(String(100), nullable=True, index=True)
    source_url = Column(String(1000), nullable=True)
    title = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)
    # Admin-curated contact inbox for the real hiring company (mirrored onto
    # Job.external_contact_email on publish/edit — see _SCRAPED_TO_JOB_FIELD_MAP).
    contact_email = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="pending", index=True)  # pending|approved|scheduled|rejected|duplicate|archived|expired
    duplicate_of = Column(String(36), nullable=True)
    published_job_id = Column(String(36), nullable=True)
    content_hash = Column(String(64), nullable=True, index=True)  # sha256(title|company|location) for dedup
    last_seen_at = Column(DateTime, nullable=True)                # last time source re-surfaced this listing
    expires_at = Column(DateTime, nullable=True)                  # auto-expire stale aggregated listings
    # The real hiring/application deadline, from the source feed or set by an
    # admin — distinct from `expires_at`, which is our internal 45-day shelf
    # life fallback used when the source doesn't provide one.
    application_deadline = Column(DateTime, nullable=True)
    # Structured content so published listings match (or beat) the source's
    # depth instead of collapsing everything into one short blurb.
    responsibilities = Column(Text, nullable=True)  # JSON array of strings
    requirements = Column(Text, nullable=True)      # JSON array of strings
    company_logo_url = Column(Text, nullable=True)
    company_website = Column(String(500), nullable=True)
    # Set when an admin approves but chooses to publish later rather than
    # immediately — a periodic sweep (publish_scheduled_scraped_jobs) creates
    # the live Job once this time arrives.
    scheduled_publish_at = Column(DateTime, nullable=True)
    # Coarse audience segment (entry_level|skilled_trade|professional|remote),
    # auto-classified on ingestion — lets admins see at a glance whether the
    # daily intake is actually spanning different audiences, not clustering
    # on whatever one source happens to publish that day.
    audience_lane = Column(String(30), nullable=True, index=True)
    # Quality/completeness gate — reuses the fraud-signal pattern from
    # companies._spam_assessment plus thin-content checks (missing company,
    # too-short description, no responsibilities/requirements captured), so
    # low-quality intake is visibly flagged for admins rather than silently
    # published looking identical to a fully-curated listing.
    quality_score = Column(Integer, nullable=False, default=0)
    quality_flags = Column(Text, nullable=True)  # JSON array of reasons


class TaskRun(Base, TimestampMixin):
    """Heartbeat ledger for scheduled (celery-beat) tasks — generalizes the
    ScraperSource.last_run_* pattern to every periodic task, not just the
    scraper. Written by app.services.task_heartbeat.track_task_run()."""
    __tablename__ = "task_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_name = Column(String(120), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="running")  # running | success | failed
    detail = Column(Text, nullable=True)


class ScraperSource(Base, TimestampMixin):
    """Admin-managed external job-board source for the scraper worker.

    Replaces the old SCRAPER_SOURCES env var so sources can be added,
    edited, or disabled from the admin board without a redeploy. `type`
    must be one of the adapter keys the scraper service actually supports
    ("careerjet" is deliberately excluded — see scraper_service.py for why).
    """
    __tablename__ = "scraper_sources"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False)
    type = Column(String(20), nullable=False)  # json | rss | greenhouse | lever
    url = Column(String(1000), nullable=False)  # feed URL, board token/slug, or full API URL
    category = Column(String(120), nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    max_results = Column(Integer, nullable=True)  # per-source override; falls back to ScraperSettings default
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), nullable=True)  # ok | error | empty
    last_run_detail = Column(Text, nullable=True)
    last_run_job_count = Column(Integer, nullable=True)


class ScraperSettings(Base, TimestampMixin):
    """Singleton row of admin-tunable global scraper defaults — the runtime
    knobs that used to be env vars (SCRAPER_TIMEOUT, SCRAPER_MAX_PER_SOURCE,
    SCRAPER_USER_AGENT, SCRAPER_MAX_INGEST_PER_RUN, SCRAPER_RUN_BUDGET_SECONDS),
    now editable from the admin board without a redeploy."""
    __tablename__ = "scraper_settings"

    id = Column(String(20), primary_key=True, default="default")
    enabled = Column(Boolean, nullable=False, default=True)  # master kill-switch for the whole scrape run
    default_timeout_seconds = Column(Integer, nullable=False, default=12)
    default_max_per_source = Column(Integer, nullable=False, default=100)
    user_agent = Column(String(255), nullable=True)  # blank = use the built-in default
    max_ingest_per_run = Column(Integer, nullable=False, default=200)
    run_budget_seconds = Column(Integer, nullable=False, default=300)


class FeatureFlag(Base, TimestampMixin):
    """Admin-editable override for a settings.X_ENABLED env flag — lets
    business-decision toggles (candidate premium, which AI providers are
    live, OTP login, ...) flip at runtime instead of requiring a redeploy.
    A missing row for a given `key` means "not overridden yet"; callers
    fall back to the env-based settings default (see
    app/services/feature_flags.py:get_flag)."""
    __tablename__ = "feature_flags"

    key = Column(String(80), primary_key=True)
    value = Column(Boolean, nullable=False, default=False)
    description = Column(Text, nullable=True)


class Plan(Base, TimestampMixin):
    """Employer subscription / pay-per-post plan."""
    __tablename__ = "plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(120), nullable=False)
    price = Column(Float, nullable=False, default=0)
    currency = Column(String(8), nullable=False, default="AOA")
    interval = Column(String(20), nullable=False, default="month")  # month | one_time
    features = Column(Text, nullable=True)  # JSON array
    active = Column(Boolean, nullable=False, default=True)


class Subscription(Base, TimestampMixin):
    """A company's active plan."""
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    plan_id = Column(String(36), ForeignKey("plans.id"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|active|expired|cancelled
    current_period_end = Column(DateTime, nullable=True)


class CandidateCvPlan(Base, TimestampMixin):
    """Admin-editable CV Builder plan catalogue (candidate side).

    Replaces the old hardcoded CV_BUILDER_PLANS constant in
    candidate_billing_service.py. `tier` is the fixed identity used
    everywhere else (CandidateCVSubscription.plan_tier, quota checks) —
    kept to the three known values (free|pro|premium) by the admin API,
    not by a DB constraint; content (price/name/features/limits) is
    admin-editable via /admin/candidate-cv-plans.
    """
    __tablename__ = "candidate_cv_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tier = Column(String(20), nullable=False, unique=True)  # free | pro | premium
    name = Column(String(120), nullable=False)
    price = Column(Float, nullable=False, default=0)
    currency = Column(String(8), nullable=False, default="AOA")
    interval = Column(String(20), nullable=False, default="month")  # month | one_time
    features = Column(Text, nullable=True)  # JSON array of display strings
    max_resumes = Column(Integer, nullable=False, default=1)  # -1 = unlimited
    ai_score = Column(Boolean, nullable=False, default=False)
    ai_rewrite = Column(Boolean, nullable=False, default=False)
    cover_letters = Column(Boolean, nullable=False, default=False)
    auto_apply = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)


class SecurityEvent(Base, TimestampMixin):
    """A security-relevant occurrence surfaced in the admin "Segurança" tab.

    Distinct from AuditLog (a record of things that DID happen, written by
    trusted code paths): SecurityEvent records things that SHOULDN'T be
    happening — failed logins, login bursts, lockouts, outbound-email rate
    limit hits. Rows are written by app.services.security_service, which also
    decides when a cluster of events warrants an alert email to the admins.
    """
    __tablename__ = "security_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String(60), nullable=False, index=True)  # failed_login|login_burst|account_locked|email_rate_limit|alert_sent|...
    severity = Column(String(10), nullable=False, default="low", index=True)  # low|medium|high
    email = Column(String(255), nullable=True, index=True)  # account targeted, if any
    ip_address = Column(String(64), nullable=True, index=True)
    user_agent = Column(String(400), nullable=True)
    details = Column(Text, nullable=True)  # JSON


class Transaction(Base, TimestampMixin):
    """Payment record (local rails: Multicaixa Express, Unitel Money, bank reference)."""
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    plan_id = Column(String(36), nullable=True)
    amount = Column(Float, nullable=False, default=0)
    currency = Column(String(8), nullable=False, default="AOA")
    provider = Column(String(40), nullable=False, default="manual")  # manual|multicaixa|unitel_money|bank
    reference = Column(String(64), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending|paid|failed|cancelled
    kind = Column(String(30), nullable=False, default="subscription")  # subscription|featured|post


class CandidateCVSubscription(Base, TimestampMixin):
    """Candidate CV Builder subscription (free | pro | premium tiers)."""
    __tablename__ = "candidate_cv_subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_profile_id = Column(String(36), ForeignKey("candidate_profiles.id"), nullable=False, index=True)
    # plan_tier: free | pro | premium
    plan_tier = Column(String(20), nullable=False, default="free")
    status = Column(String(20), nullable=False, default="active")  # active | expired | cancelled
    current_period_end = Column(DateTime, nullable=True)
    # Payment tracking (reuses Transaction.reference)
    transaction_reference = Column(String(64), nullable=True, index=True)

    candidate_profile = relationship("CandidateProfile")


class OtpCode(Base, TimestampMixin):
    """One-time code for phone login / verification."""
    __tablename__ = "otp_codes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone = Column(String(20), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    purpose = Column(String(30), nullable=False, default="login")  # login | verify
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)


