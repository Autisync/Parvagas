"""Admin-editable overrides for settings.X_ENABLED env flags.

Most call sites needing a flag check (resume_ai_service, cv_parser_service,
auto_apply_service, cv_export_service, hibp_service) are deep static-method
helpers with no `db` session in scope — threading one through every caller
up the stack would be a much larger refactor than "let admins flip a
switch." get_flag() instead opens its own short-lived session when the
caller doesn't already have one open, and always falls back to the env
default on any DB problem, so a flag lookup can never break the feature
it's gating.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.core.logging import get_logger

if TYPE_CHECKING:
    from app.models import FeatureFlag

logger = get_logger(__name__)


def get_flag(key: str, default: bool, db: Session | None = None) -> bool:
    """Effective value for `key` — the admin-set override if one exists,
    else `default` (the caller's settings.X_ENABLED value)."""
    owns_session = db is None
    if owns_session:
        from app.db.session import SessionLocal
        db = SessionLocal()
    try:
        from app.models import FeatureFlag

        row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
        return bool(row.value) if row is not None else default
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_flag(%s) failed, falling back to default=%s: %s", key, default, exc)
        return default
    finally:
        if owns_session:
            db.close()


def list_flags(db: Session) -> list["FeatureFlag"]:
    from app.models import FeatureFlag

    return db.query(FeatureFlag).order_by(FeatureFlag.key).all()


def set_flag(db: Session, key: str, value: bool, description: str | None = None) -> "FeatureFlag":
    from app.models import FeatureFlag

    row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if row:
        row.value = value
        if description is not None:
            row.description = description
    else:
        row = FeatureFlag(key=key, value=value, description=description)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
