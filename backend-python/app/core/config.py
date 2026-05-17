"""Application configuration."""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # App
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PORT: int = int(os.getenv("PORT", 8000))
    DEBUG: bool = APP_ENV == "development"

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://parvagas_user:change_me@localhost:5432/parvagas"
    )

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Celery
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

    # Auth provider
    AUTH_PROVIDER: str = os.getenv("AUTH_PROVIDER", "local")
    AUTH0_DOMAIN: str = os.getenv("AUTH0_DOMAIN", "")
    AUTH0_AUDIENCE: str = os.getenv("AUTH0_AUDIENCE", "")
    AUTH0_ISSUER: str = os.getenv("AUTH0_ISSUER", "")
    AUTH0_ALGORITHMS: str = os.getenv("AUTH0_ALGORITHMS", "RS256")

    # URLs
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")

    # Email branding
    BRAND_NAME: str = os.getenv("BRAND_NAME", "Parvagas")
    BRAND_TEAM_NAME: str = os.getenv("BRAND_TEAM_NAME", "Parvagas Team")
    BRAND_LOGO_URL: str = os.getenv("BRAND_LOGO_URL", f"{FRONTEND_URL}/logo.png")
    BRAND_PRIMARY_COLOR: str = os.getenv("BRAND_PRIMARY_COLOR", "#dc2626")
    BRAND_PRIMARY_COLOR_HOVER: str = os.getenv("BRAND_PRIMARY_COLOR_HOVER", "#b91c1c")
    BRAND_TEXT_STRONG: str = os.getenv("BRAND_TEXT_STRONG", "#0f172a")
    BRAND_TEXT_MUTED: str = os.getenv("BRAND_TEXT_MUTED", "#475569")
    BRAND_BG_MUTED: str = os.getenv("BRAND_BG_MUTED", "#f8fafc")

    # SMTP
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_SECURE: bool = os.getenv("SMTP_SECURE", "false").lower() == "true"
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@parvagas.com")

    # File upload
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/app/uploads")
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", 10))

    # CORS
    CORS_ORIGIN: str = os.getenv("CORS_ORIGIN", FRONTEND_URL)

    # Admin key
    ADMIN_SIGNUP_KEY: str = os.getenv("ADMIN_SIGNUP_KEY", "")
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "admin@autisync.com")
    SUPER_ADMIN_FULL_NAME: str = os.getenv("SUPER_ADMIN_FULL_NAME", "AutiSync Super Admin")
    MODERATOR_EMAIL: str = os.getenv("MODERATOR_EMAIL", "")
    MODERATOR_FULL_NAME: str = os.getenv("MODERATOR_FULL_NAME", "AutiSync Moderator")
    MODERATOR_SIGNUP_KEY: str = os.getenv("MODERATOR_SIGNUP_KEY", "")

    class Config:
        """Pydantic config."""
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
