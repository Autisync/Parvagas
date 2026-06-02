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
    budget = Column(Float, nullable=True)
    clicks = Column(Integer, nullable=False, default=0)
    impressions = Column(Integer, nullable=False, default=0)

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
