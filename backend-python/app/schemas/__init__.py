"""Pydantic schemas for request/response validation."""
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# Auth Schemas
class UserRegisterRequest(BaseModel):
    """User registration request."""
    model_config = ConfigDict(populate_by_name=True)

    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(validation_alias=AliasChoices("full_name", "fullName"))
    role: str = Field(default="candidate", pattern="^(candidate|company)$")
    company_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("company_name", "companyName"))
    company_legal_name: Optional[str] = Field(default=None, validation_alias=AliasChoices("company_legal_name", "companyLegalName"))
    nif: Optional[str] = None
    # The frontend has sent these since before this field existed on the
    # backend — previously silently dropped by Pydantic (extra fields
    # ignored by default), so acceptance was never actually recorded
    # despite the Privacy Policy claiming it is. See legal_service /
    # LegalAcceptance (Wave C1, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).
    accept_terms: bool = Field(default=False, validation_alias=AliasChoices("accept_terms", "acceptTerms"))
    accept_privacy: bool = Field(default=False, validation_alias=AliasChoices("accept_privacy", "acceptPrivacy"))


class UserLoginRequest(BaseModel):
    """User login request."""
    email: EmailStr
    password: str
    role_hint: Optional[str] = None


class UserResponse(BaseModel):
    """User response.

    has_completed_onboarding / has_seen_tutorial / has_seen_empresa_tutorial /
    company_status / company_team_role live on CandidateProfile/Company/
    CompanyMember, not on User — they are None unless explicitly populated by
    a helper (e.g. AuthService.build_user_response) that looks up the related
    row. A bare ``UserResponse.model_validate(user)`` leaves them None, so
    frontend code must not assume they are always present for every caller.
    """
    id: str
    email: str
    full_name: str
    role: str
    admin_level: Optional[str] = None
    email_verified: bool
    has_completed_onboarding: Optional[bool] = None
    has_seen_tutorial: Optional[bool] = None
    has_seen_empresa_tutorial: Optional[bool] = None
    company_status: Optional[str] = None
    company_team_role: Optional[str] = None
    is_guest_account: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class AuthTokenResponse(BaseModel):
    """Auth token response."""
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: UserResponse
    isNewUser: bool | None = None


class EmailVerificationRequest(BaseModel):
    """Email verification request."""
    token: str


class ResendVerificationRequest(BaseModel):
    """Resend verification email request."""
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    """Forgot password request."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password request."""
    token: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str


# Candidate Schemas
class CandidateProfileResponse(BaseModel):
    """Candidate profile response."""
    id: str
    user_id: str
    first_name: Optional[str]
    last_name: Optional[str]
    phone: Optional[str]
    location: Optional[str]
    postcode: Optional[str]
    linkedin_url: Optional[str]
    portfolio_url: Optional[str]
    github_url: Optional[str]
    professional_summary: Optional[str]
    job_title: Optional[str]
    years_of_experience: Optional[int]
    skills: Optional[str]
    
    model_config = ConfigDict(from_attributes=True)


class CandidateProfileUpdateRequest(BaseModel):
    """Update candidate profile request."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    postcode: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    professional_summary: Optional[str] = None
    job_title: Optional[str] = None
    years_of_experience: Optional[int] = None
    skills: Optional[str] = None


# Company Schemas
class CompanyProfileResponse(BaseModel):
    """Company profile response."""
    id: str
    owner_user_id: str
    name: str
    legal_name: Optional[str]
    nif: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    website: Optional[str]
    status: str
    description: Optional[str]
    logo_url: Optional[str]
    angolanizacao: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class CompanyProfileUpdateRequest(BaseModel):
    """Update company profile request."""
    name: Optional[str] = None
    legal_name: Optional[str] = None
    nif: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    angolanizacao: Optional[bool] = None


# CV Schemas
class ParsedCVProfile(BaseModel):
    """Parsed CV profile data."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    postcode: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    professional_summary: Optional[str] = None
    job_title: Optional[str] = None
    years_of_experience: Optional[int] = None
    skills: List[str] = []
    # Split skill buckets from the rules-based parser (stored as separate columns).
    hard_skills: List[str] = []
    techniques: List[str] = []
    tools: List[str] = []
    work_experience: List[dict] = []
    education: List[dict] = []
    # certifications/languages are simple string lists (heuristic + frontend
    # both treat them as string[]); typing them as List[dict] caused pydantic
    # serializer warnings and a type-contract mismatch.
    certifications: List[str] = []
    languages: List[str] = []


class CVUploadResponse(BaseModel):
    """CV upload and parsing response."""
    success: bool
    parsed_profile: Optional[ParsedCVProfile] = None
    confidence: dict = {}
    warnings: List[str] = []


class ResumeTemplateResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    preview_url: Optional[str] = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class ResumeResponse(BaseModel):
    id: str
    candidate_profile_id: str
    title: str
    summary: Optional[str] = None
    template_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_draft: bool
    is_published: bool
    share_slug: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumeCreateRequest(BaseModel):
    title: str
    summary: Optional[str] = None
    template_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_draft: Optional[bool] = True
    # When true, `data` is ignored and the resume is initialized from the
    # candidate's saved CandidateProfile instead — "A partir do meu perfil"
    # in the builder's create flow (never a blank canvas, per the UX spec).
    from_profile: Optional[bool] = False


class ResumeUpdateRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    template_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_draft: Optional[bool] = None
    is_published: Optional[bool] = None


class ResumeScoreResponse(BaseModel):
    overall_score: Optional[float] = None
    skills_score: Optional[float] = None
    experience_score: Optional[float] = None
    formatting_score: Optional[float] = None
    ats_score: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
    # Plain-language "why this score + what to do" per dimension — always
    # present regardless of scoring source (see ResumeAIService._build_dimension_explanations).
    explanations: Optional[List[Dict[str, Any]]] = None


class ResumeApplyToProfileResponse(BaseModel):
    """Result of syncing a built resume's content back onto the candidate's
    profile ("Aplicar ao perfil") — the inverse of "A partir do meu perfil"."""
    updated_fields: List[str]
    cv_document_id: Optional[str] = None


class ResumeRewriteResponse(BaseModel):
    id: str
    candidate_profile_id: str
    title: str
    summary: Optional[str] = None
    template_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_draft: bool
    is_published: bool
    share_slug: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    notes: Optional[str] = None
    source: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ResumeRewriteRequest(BaseModel):
    resume_id: str
    tone: Optional[str] = Field(default="professional")
    instructions: Optional[str] = None


class ExperienceImproveRequest(BaseModel):
    """Improve wording for a single work-experience entry, in-place in the
    builder's edit modal — stateless (no resume_id): the candidate hasn't
    necessarily saved this entry yet, so there's nothing to look up."""
    job_title: Optional[str] = Field(default=None, max_length=200)
    company: Optional[str] = Field(default=None, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    tone: Optional[str] = Field(default="professional")


class ExperienceImproveResponse(BaseModel):
    description: str
    notes: Optional[str] = None
    source: Optional[str] = None


class CoverLetterCreateRequest(BaseModel):
    resume_id: Optional[str] = None
    job_id: Optional[str] = None
    title: str
    content: str
    language: Optional[str] = None
    is_draft: Optional[bool] = True


class CoverLetterUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_draft: Optional[bool] = None


class CoverLetterResponse(BaseModel):
    id: str
    candidate_profile_id: str
    resume_id: Optional[str] = None
    job_id: Optional[str] = None
    title: str
    content: str
    language: Optional[str] = None
    is_draft: bool
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ATSStageCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    position: Optional[int] = 0


class ATSStageUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    position: Optional[int] = None


class ATSStageResponse(BaseModel):
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ATSPipelineItemCreateRequest(BaseModel):
    # A pipeline item is created FROM an application, not by hand-picking a
    # candidate profile — candidate_profile_id is derived server-side from
    # the application.
    application_id: str
    stage_id: Optional[str] = None
    notes: Optional[str] = None


class ATSPipelineItemMoveRequest(BaseModel):
    stage_id: str


class ATSPipelineItemResponse(BaseModel):
    id: str
    company_id: str
    application_id: Optional[str] = None
    candidate_profile_id: Optional[str] = None
    stage_id: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Generic Responses
class MessageResponse(BaseModel):
    """Generic message response."""
    message: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
