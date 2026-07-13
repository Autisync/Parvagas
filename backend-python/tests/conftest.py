"""Shared pytest fixtures and environment setup.

Forces a non-production APP_ENV with safe secrets so the production fail-fast in
Settings does not block the test process, and so security helpers have a stable
signing key.
"""
import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-that-is-long-enough-1234567890")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("ADMIN_SIGNUP_KEY", "test-admin-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")

import pytest  # noqa: E402

# Tests call endpoint functions directly (no ASGI/HTTP layer), so
# @limiter.limit-decorated endpoints have no real Starlette Request to
# inspect. slowapi skips that check entirely when the limiter is disabled —
# the standard way to unit-test rate-limited endpoints — so real rate
# limiting is never exercised here; it's covered by living behind the same
# well-established slowapi wiring already used by auth.py/ads.py/etc.
from app.core.observability import limiter  # noqa: E402

limiter.enabled = False


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """Ensure each test sees a fresh Settings build when env changes."""
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
