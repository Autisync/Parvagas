"""Pydantic schemas for request/response validation."""
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, validator
from typing import Optional, List
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


class UserLoginRequest(BaseModel):
    """User login request."""
    email: EmailStr
    password: str
    role_hint: Optional[str] = None


class UserResponse(BaseModel):
    """User response."""
    id: str
    email: str
    full_name: str
    role: str
    admin_level: Optional[str] = None
    email_verified: bool
    
    class Config:
        from_attributes = True


class AuthTokenResponse(BaseModel):
    """Auth token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


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
    
    class Config:
        from_attributes = True


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
    
    class Config:
        from_attributes = True


class CompanyProfileUpdateRequest(BaseModel):
    """Update company profile request."""
    name: Optional[str] = None
    legal_name: Optional[str] = None
    nif: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None


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
    work_experience: List[dict] = []
    education: List[dict] = []
    certifications: List[dict] = []
    languages: List[dict] = []


class CVUploadResponse(BaseModel):
    """CV upload and parsing response."""
    success: bool
    parsed_profile: Optional[ParsedCVProfile] = None
    confidence: dict = {}
    warnings: List[str] = []


# Generic Responses
class MessageResponse(BaseModel):
    """Generic message response."""
    message: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
