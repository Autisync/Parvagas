"""Tests for production fail-fast configuration."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings, _INSECURE_JWT_SECRET


def _base_env(**overrides):
    env = {
        "APP_ENV": "production",
        "JWT_SECRET": "a" * 40,
        "DATABASE_URL": "postgresql+psycopg://user:strongpass@db:5432/parvagas",
        "ADMIN_SIGNUP_KEY": "real-admin-key",
    }
    env.update(overrides)
    return env


def test_production_rejects_default_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(**_base_env(JWT_SECRET=_INSECURE_JWT_SECRET))


def test_production_rejects_short_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(**_base_env(JWT_SECRET="too-short"))


def test_production_rejects_placeholder_db_password():
    with pytest.raises(ValidationError):
        Settings(**_base_env(DATABASE_URL="postgresql+psycopg://u:change_me@db:5432/p"))


def test_production_requires_admin_signup_key():
    with pytest.raises(ValidationError):
        Settings(**_base_env(ADMIN_SIGNUP_KEY=""))


def test_production_accepts_strong_config():
    settings = Settings(**_base_env())
    assert settings.is_production is True


def test_development_tolerates_insecure_defaults():
    settings = Settings(APP_ENV="development", JWT_SECRET=_INSECURE_JWT_SECRET)
    assert settings.is_production is False
