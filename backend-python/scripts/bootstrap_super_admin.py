"""Create or promote the configured super admin user.

Usage:
    python scripts/bootstrap_super_admin.py
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import AdminLevel, User, UserRole


def bootstrap_super_admin() -> None:
    settings = get_settings()
    admin_signup_key = (settings.ADMIN_SIGNUP_KEY or "").strip()
    super_admin_email = (settings.SUPER_ADMIN_EMAIL or "admin@autisync.com").strip().lower()
    super_admin_full_name = (settings.SUPER_ADMIN_FULL_NAME or "AutiSync Super Admin").strip()
    moderator_email = (settings.MODERATOR_EMAIL or "").strip().lower()
    moderator_full_name = (settings.MODERATOR_FULL_NAME or "AutiSync Moderator").strip()
    moderator_signup_key = (settings.MODERATOR_SIGNUP_KEY or "").strip()

    if not admin_signup_key:
        raise RuntimeError("ADMIN_SIGNUP_KEY is required to bootstrap super admin")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        def upsert_admin_account(email: str, full_name: str, password: str, admin_level: AdminLevel) -> str:
            user = db.query(User).filter(User.email == email).first()
            hashed_password = hash_password(password)
            admin_level_value = admin_level.value if hasattr(admin_level, "value") else str(admin_level)

            if user:
                user.full_name = full_name
                user.role = UserRole.admin
                user.admin_level = admin_level_value
                user.password_hash = hashed_password
                user.email_verified = True
                user.email_verified_at = now
                user.suspended = False
                user.failed_login_attempts = 0
                user.locked_until = None
                return "updated"

            user = User(
                email=email,
                full_name=full_name,
                password_hash=hashed_password,
                role=UserRole.admin,
                admin_level=admin_level_value,
                email_verified=True,
                email_verified_at=now,
                suspended=False,
                failed_login_attempts=0,
                locked_until=None,
            )
            db.add(user)
            return "created"

        action = upsert_admin_account(super_admin_email, super_admin_full_name, admin_signup_key, AdminLevel.super_admin)
        print(f"Super admin {action}: {super_admin_email}")

        if moderator_email and moderator_signup_key:
            moderator_action = upsert_admin_account(moderator_email, moderator_full_name, moderator_signup_key, AdminLevel.moderator)
            print(f"Moderator {moderator_action}: {moderator_email}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    bootstrap_super_admin()
