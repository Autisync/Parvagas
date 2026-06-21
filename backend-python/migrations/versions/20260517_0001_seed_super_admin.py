"""Seed super admin from environment settings.

Revision ID: 20260517_0001
Revises: 
Create Date: 2026-05-17 00:00:01
"""
from typing import Sequence, Union
import os
import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext


# revision identifiers, used by Alembic.
revision: str = "20260517_0001"
down_revision: Union[str, None] = "20260516_0000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, autoload_with=bind)
    has_admin_level = "admin_level" in users.c

    admin_signup_key = (os.getenv("ADMIN_SIGNUP_KEY") or "").strip()
    super_admin_email = (os.getenv("SUPER_ADMIN_EMAIL") or "admin@autisync.com").strip().lower()
    super_admin_full_name = (os.getenv("SUPER_ADMIN_FULL_NAME") or "AutiSync Super Admin").strip()

    if not admin_signup_key:
        raise RuntimeError("ADMIN_SIGNUP_KEY must be set before running migration 20260517_0001")

    password_hash = _hash_password(admin_signup_key)
    now = datetime.utcnow()

    existing = bind.execute(
        sa.select(users.c.id).where(users.c.email == super_admin_email)
    ).fetchone()

    if existing:
        update_values = dict(
            full_name=super_admin_full_name,
            role="admin",
            password_hash=password_hash,
            email_verified=True,
            email_verified_at=now,
            suspended=False,
            failed_login_attempts=0,
            locked_until=None,
            updated_at=now,
        )
        if has_admin_level:
            update_values["admin_level"] = "super-admin"

        bind.execute(
            sa.update(users)
            .where(users.c.id == existing[0])
            .values(**update_values)
        )
    else:
        insert_values = dict(
            id=str(uuid.uuid4()),
            email=super_admin_email,
            full_name=super_admin_full_name,
            role="admin",
            password_hash=password_hash,
            email_verified=True,
            email_verified_at=now,
            suspended=False,
            failed_login_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
        )
        if has_admin_level:
            insert_values["admin_level"] = "super-admin"

        bind.execute(
            sa.insert(users).values(**insert_values)
        )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, autoload_with=bind)

    super_admin_email = (os.getenv("SUPER_ADMIN_EMAIL") or "admin@autisync.com").strip().lower()
    bind.execute(sa.delete(users).where(users.c.email == super_admin_email))
