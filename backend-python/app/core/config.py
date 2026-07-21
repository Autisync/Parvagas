"""Application configuration."""
import os
from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Environments where insecure defaults are tolerated (local/CI only).
_NON_PROD_ENVS = {"development", "dev", "local", "test", "testing", "ci"}

# Known-insecure default values that must never reach production.
_INSECURE_JWT_SECRET = "your-secret-key-change-in-production"
_INSECURE_DB_MARKERS = ("change_me", ":change_me@", "change-me")


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
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))

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

    # Email delivery — provider: smtp (default) | resend
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    # SMTP
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_SECURE: bool = os.getenv("SMTP_SECURE", "true").lower() == "true"
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@parvagas.com")

    # File upload — STORAGE_PROVIDER: local (default) | supabase (temp) | server (self-hosted S3/MinIO, final stage)
    STORAGE_PROVIDER: str = os.getenv("STORAGE_PROVIDER", "local").strip().lower()
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/app/uploads")
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", 10))
    # Supabase Storage (temporary infra)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_BUCKET: str = os.getenv("SUPABASE_BUCKET", "cvs")
    # Self-hosted S3-compatible object store on your own server (e.g. MinIO) — for launch.
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "")        # e.g. https://storage.parvagas.pt
    S3_BUCKET: str = os.getenv("S3_BUCKET", "cvs")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")

    # MinIO / object storage
    USE_MINIO_STORAGE: bool = os.getenv("USE_MINIO_STORAGE", "false").lower() == "true"
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "parvagas")
    MINIO_REGION: str = os.getenv("MINIO_REGION", "us-east-1")
    MINIO_URL: str = os.getenv("MINIO_URL", "")

    # Optional AI-assisted CV parsing
    CV_PARSER_AI_ENABLED: bool = os.getenv("CV_PARSER_AI_ENABLED", "false").lower() == "true"
    CV_PARSER_AI_PROVIDER: str = os.getenv("CV_PARSER_AI_PROVIDER", "openai")
    CV_PARSER_AI_BASE_URL: str = os.getenv("CV_PARSER_AI_BASE_URL", "https://api.openai.com/v1")
    CV_PARSER_AI_API_KEY: str = os.getenv("CV_PARSER_AI_API_KEY", "")
    CV_PARSER_AI_MODEL: str = os.getenv("CV_PARSER_AI_MODEL", "gpt-4.1-mini")
    CV_PARSER_AI_TIMEOUT_SECONDS: int = int(os.getenv("CV_PARSER_AI_TIMEOUT_SECONDS", 30))
    CV_PARSER_AI_ORGANIZATION: str = os.getenv("CV_PARSER_AI_ORGANIZATION", "")
    CV_PARSER_AI_PROJECT: str = os.getenv("CV_PARSER_AI_PROJECT", "")
    CV_PARSER_AI_APP_NAME: str = os.getenv("CV_PARSER_AI_APP_NAME", "Parvagas CV Parser")
    CV_PARSER_AI_SITE_URL: str = os.getenv("CV_PARSER_AI_SITE_URL", FRONTEND_URL)
    CV_PARSER_AI_AZURE_API_VERSION: str = os.getenv("CV_PARSER_AI_AZURE_API_VERSION", "2024-10-21")

    # Shared LLM service (app.services.llm_service) — used by auto-apply scoring,
    # CV keyword injection, and premium AI tools. Defaults to the self-hosted
    # Ollama container already in docker-compose (OpenAI-compatible /v1 API,
    # no API key required), matching the "Llama as AI processor" plan. Point
    # these at OpenAI/Azure/OpenRouter instead by overriding the env vars —
    # same provider-switch pattern as CV_PARSER_AI_* above.
    LLM_ENABLED: bool = os.getenv("LLM_ENABLED", "true").lower() == "true"
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://ollama:11434/v1")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "llama3.2:3b")
    LLM_TIMEOUT_SECONDS: int = int(os.getenv("LLM_TIMEOUT_SECONDS", 20))

    # Per-feature flags for Llama-backed features (TEST_PLAN_CAREER_OPS.md) —
    # ship dark, enable per cohort once staging-verified. Each feature already
    # falls back to its non-LLM behavior on any failure regardless of this
    # flag; the flag controls whether the LLM is called at all.
    AUTO_APPLY_LLM_SCORING_ENABLED: bool = os.getenv("AUTO_APPLY_LLM_SCORING_ENABLED", "false").lower() == "true"
    CV_EXPORT_LLM_INJECTION_ENABLED: bool = os.getenv("CV_EXPORT_LLM_INJECTION_ENABLED", "false").lower() == "true"

    # Candidate premium AI tools (interview prep, cover letter, company
    # snapshot — app.api.v1.candidates) AND CV Builder subscription quotas
    # (max resumes, cover letters, auto-apply — app.api.v1.resumes). One
    # master ship-free switch for both: while this is false (the default),
    # EVERY candidate has access regardless of CandidateCVSubscription rows
    # — no pricing has been decided yet, so both ship as free features.
    # Flip to true once a real plan exists to start enforcing
    # app.services.candidate_billing_service (C4: gates on a paid
    # CandidateCVSubscription tier, the same table the CV builder's own
    # pro/premium tiers already use — see payments.py).
    CANDIDATE_PREMIUM_ENABLED: bool = os.getenv("CANDIDATE_PREMIUM_ENABLED", "false").lower() == "true"

    # WeasyPrint HTML/CSS-driven resume rendering (EXECUTION_PLAN_NATIVE_
    # CV_BUILDER.md Phase B) — ship dark: while false, /resumes/{id}/export
    # and /resumes/{id}/preview.html fall back to the Phase A reportlab
    # path (to_pdf), which never depends on WeasyPrint/pango being present.
    RESUME_WEASYPRINT_ENABLED: bool = os.getenv("RESUME_WEASYPRINT_ENABLED", "false").lower() == "true"

    # Optional AI-assisted resume scoring and rewrite
    RESUME_AI_ENABLED: bool = os.getenv("RESUME_AI_ENABLED", "false").lower() == "true"
    RESUME_AI_PROVIDER: str = os.getenv("RESUME_AI_PROVIDER", "openai")
    RESUME_AI_BASE_URL: str = os.getenv("RESUME_AI_BASE_URL", "https://api.openai.com/v1")
    RESUME_AI_API_KEY: str = os.getenv("RESUME_AI_API_KEY", "")
    RESUME_AI_MODEL: str = os.getenv("RESUME_AI_MODEL", "gpt-4.1-mini")
    RESUME_AI_TIMEOUT_SECONDS: int = int(os.getenv("RESUME_AI_TIMEOUT_SECONDS", 30))
    RESUME_AI_ORGANIZATION: str = os.getenv("RESUME_AI_ORGANIZATION", "")
    RESUME_AI_PROJECT: str = os.getenv("RESUME_AI_PROJECT", "")
    RESUME_AI_APP_NAME: str = os.getenv("RESUME_AI_APP_NAME", "Parvagas Resume AI")
    RESUME_AI_SITE_URL: str = os.getenv("RESUME_AI_SITE_URL", FRONTEND_URL)
    RESUME_AI_AZURE_API_VERSION: str = os.getenv("RESUME_AI_AZURE_API_VERSION", "2024-10-21")

    # CV parsing queue and guardrails
    CV_PARSE_MAX_UPLOAD_MB: int = int(os.getenv("CV_PARSE_MAX_UPLOAD_MB", 5))
    CV_PARSE_MAX_JOBS_PER_USER_PER_DAY: int = int(os.getenv("CV_PARSE_MAX_JOBS_PER_USER_PER_DAY", 10))
    CV_PARSE_TASK_SOFT_TIMEOUT_SECONDS: int = int(os.getenv("CV_PARSE_TASK_SOFT_TIMEOUT_SECONDS", 90))
    CV_PARSE_TASK_TIMEOUT_SECONDS: int = int(os.getenv("CV_PARSE_TASK_TIMEOUT_SECONDS", 120))

    # OCR for scanned PDFs and image CVs (Tesseract). Bounded so a large scan
    # can't exhaust worker CPU/memory; the Celery soft timeout is the backstop.
    CV_OCR_ENABLED: bool = os.getenv("CV_OCR_ENABLED", "true").lower() == "true"
    CV_OCR_LANGS: str = os.getenv("CV_OCR_LANGS", "por+eng")
    CV_OCR_MAX_PAGES: int = int(os.getenv("CV_OCR_MAX_PAGES", 8))
    CV_OCR_DPI: int = int(os.getenv("CV_OCR_DPI", 200))
    CV_OCR_MAX_IMAGE_MEGAPIXELS: int = int(os.getenv("CV_OCR_MAX_IMAGE_MEGAPIXELS", 40))

    # CORS
    CORS_ORIGIN: str = os.getenv("CORS_ORIGIN", FRONTEND_URL)

    # Ollama — free-tier local AI for CV builder (no subscription required).
    # Runs alongside the stack; paid users fall through to RESUME_AI_* (cloud).
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    OLLAMA_FREE_TIER_ENABLED: bool = os.getenv("OLLAMA_FREE_TIER_ENABLED", "true").lower() == "true"
    OLLAMA_TIMEOUT_SECONDS: int = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "60"))
    # Soft cap on requests in flight to the self-hosted Ollama container at
    # once, shared across every Gunicorn worker via Redis. The container is
    # capped at 2 CPUs running a 3B model (docker-compose.prod.yml) — beyond
    # ~4 concurrent generations, requests don't fail, they all just get
    # slower together and start missing their timeout. Capping means the
    # (max_concurrent)th+1 request fails fast into the existing heuristic/
    # empty-result fallback instead of queueing behind an already-saturated
    # model. 0 disables the cap.
    OLLAMA_MAX_CONCURRENT: int = int(os.getenv("OLLAMA_MAX_CONCURRENT", "4"))

    # Deploy automation (used by admin deploy panel)
    # Option A: Portainer stack-update webhook (recommended for production).
    DEPLOY_WEBHOOK_URL: str = os.getenv("DEPLOY_WEBHOOK_URL", "")
    # Option B: run `git push origin main` from the repo root (dev/simple setups).
    DEPLOY_GIT_PUSH: bool = os.getenv("DEPLOY_GIT_PUSH", "false").lower() == "true"

    # Admin key
    ADMIN_SIGNUP_KEY: str = os.getenv("ADMIN_SIGNUP_KEY", "")
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "admin@parvagas.pt")
    SUPER_ADMIN_FULL_NAME: str = os.getenv("SUPER_ADMIN_FULL_NAME", "Parvagas Super Admin")
    MODERATOR_EMAIL: str = os.getenv("MODERATOR_EMAIL", "")
    MODERATOR_FULL_NAME: str = os.getenv("MODERATOR_FULL_NAME", "Parvagas Moderator")
    MODERATOR_SIGNUP_KEY: str = os.getenv("MODERATOR_SIGNUP_KEY", "")

    # Security monitoring (app.services.security_service) — added after the
    # 2026-07-09 no-reply@ SMTP credential compromise. Failed logins are
    # recorded per-account with IP/user-agent; a burst (threshold within
    # window) triggers an alert email to SECURITY_ALERT_EMAIL cc
    # SECURITY_ALERT_CC, throttled by the cooldown so a sustained attack
    # doesn't itself flood the admin inbox.
    SECURITY_ALERT_EMAIL: str = os.getenv("SECURITY_ALERT_EMAIL", "admin@parvagas.pt")
    SECURITY_ALERT_CC: str = os.getenv("SECURITY_ALERT_CC", "support@parvagas.pt")
    SECURITY_FAILED_LOGIN_BURST_THRESHOLD: int = int(os.getenv("SECURITY_FAILED_LOGIN_BURST_THRESHOLD", 5))
    SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES: int = int(os.getenv("SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES", 10))
    SECURITY_ALERT_COOLDOWN_MINUTES: int = int(os.getenv("SECURITY_ALERT_COOLDOWN_MINUTES", 30))

    # Payment-dispute rate monitoring (app.services.dispute_service, Wave D,
    # EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md / fluxo-resolucao-disputas.md
    # Section 7). When resolved disputes as a share of paid transactions in
    # the trailing window exceed this threshold, a high-severity security
    # alert fires via the same SecurityEvent/cooldown machinery as the
    # login-burst check above — an abnormal dispute rate is treated as a
    # possible fraud/security incident, not just a support-volume metric.
    DISPUTE_RATE_ALERT_THRESHOLD: float = float(os.getenv("DISPUTE_RATE_ALERT_THRESHOLD", 0.1))
    DISPUTE_RATE_WINDOW_DAYS: int = int(os.getenv("DISPUTE_RATE_WINDOW_DAYS", 30))
    DISPUTE_RATE_MIN_TRANSACTIONS: int = int(os.getenv("DISPUTE_RATE_MIN_TRANSACTIONS", 10))

    # Outbound email rate limit — hard hourly cap across ALL sends from this
    # backend. Legit traffic is far below this; a compromised credential or a
    # runaway loop trips it, blocks further sends for the rest of the hour,
    # and records a high-severity security event (which alerts admins via the
    # priority bypass). 0 disables the cap.
    EMAIL_MAX_PER_HOUR: int = int(os.getenv("EMAIL_MAX_PER_HOUR", 200))

    # Have I Been Pwned (app.services.hibp_service).
    # HIBP_API_KEY: paid subscription key for the v3 breachedaccount API —
    # empty (default) disables the daily account-breach scan entirely.
    # The scan walks accounts oldest-checked-first, capped per run, with a
    # sleep between calls sized for the cheapest HIBP rate tier (10 rpm).
    HIBP_API_KEY: str = os.getenv("HIBP_API_KEY", "")
    HIBP_DAILY_CHECK_LIMIT: int = int(os.getenv("HIBP_DAILY_CHECK_LIMIT", 300))
    HIBP_REQUEST_INTERVAL_SECONDS: float = float(os.getenv("HIBP_REQUEST_INTERVAL_SECONDS", 6.5))
    # Pwned Passwords k-anonymity check at registration/password-reset (free,
    # no key). Off by default (ship dark): flipping it on makes those flows
    # reject passwords found in breach corpora with a friendly PT message.
    HIBP_PASSWORD_CHECK_ENABLED: bool = os.getenv("HIBP_PASSWORD_CHECK_ENABLED", "false").lower() == "true"

    # Phone/OTP login (mobile-first market). Backend is complete but ships
    # dark: off by default, flippable at runtime via the OTP_LOGIN_ENABLED
    # feature flag without a redeploy. Real SMS delivery is a separate,
    # not-yet-done task — send_sms() stays on its log-only provider either way.
    OTP_LOGIN_ENABLED: bool = os.getenv("OTP_LOGIN_ENABLED", "false").lower() == "true"

    # Observability
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))

    # Trusted hosts (comma-separated). "*" disables the check (dev only).
    TRUSTED_HOSTS: str = os.getenv("TRUSTED_HOSTS", "*")

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() not in _NON_PROD_ENVS

    @model_validator(mode="after")
    def _enforce_production_secrets(self) -> "Settings":
        """Refuse to boot in production with insecure default secrets."""
        if not self.is_production:
            return self

        problems: list[str] = []
        if self.JWT_SECRET == _INSECURE_JWT_SECRET or len(self.JWT_SECRET) < 32:
            problems.append("JWT_SECRET must be set to a strong value (>= 32 chars)")
        if any(marker in self.DATABASE_URL for marker in _INSECURE_DB_MARKERS):
            problems.append("DATABASE_URL still contains an insecure placeholder password")
        if not self.ADMIN_SIGNUP_KEY:
            problems.append("ADMIN_SIGNUP_KEY must be set in production")

        if problems:
            joined = "; ".join(problems)
            raise ValueError(
                f"Refusing to start in APP_ENV='{self.APP_ENV}' with insecure config: {joined}"
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
