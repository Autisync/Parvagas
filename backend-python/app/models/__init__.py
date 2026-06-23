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
    admin = "admin"


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
    
    # Skills
    skills = Column(Text, nullable=True)  # JSON array as string
    
    # Experience
    work_experience = Column(Text, nullable=True)  # JSON array as string
    education = Column(Text, nullable=True)  # JSON array as string
    certifications = Column(Text, nullable=True)  # JSON array as string
    languages = Column(Text, nullable=True)  # JSON array as string
    
    # Onboarding
    has_completed_onboarding = Column(Boolean, nullable=False, default=False)
    has_seen_tutorial = Column(Boolean, nullable=False, default=False)
    
    # Relations
    user = relationship("User", back_populates="candidate_profile")
    cv_uploads = relationship("CVUpload", back_populates="candidate_profile")


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

    expires_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)

    # Search facets / analytics / trust
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    views = Column(Integer, nullable=False, default=0)
    spam_score = Column(Integer, nullable=False, default=0)
    spam_flags = Column(Text, nullable=True)  # JSON array of reasons

    # Aggregation attribution (set when published from a scraped/external source)
    source = Column(String(100), nullable=True)
    source_url = Column(String(1000), nullable=True)

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


class ScrapedJob(Base, TimestampMixin):
    """External job listing ingested for curation into the public board."""
    __tablename__ = "scraped_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source = Column(String(100), nullable=True, index=True)
    source_url = Column(String(1000), nullable=True)
    title = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="pending", index=True)  # pending|approved|rejected|duplicate|archived|expired
    duplicate_of = Column(String(36), nullable=True)
    published_job_id = Column(String(36), nullable=True)
    content_hash = Column(String(64), nullable=True, index=True)  # sha256(title|company|location) for dedup
    last_seen_at = Column(DateTime, nullable=True)                # last time source re-surfaced this listing
    expires_at = Column(DateTime, nullable=True)                  # auto-expire stale aggregated listings


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
