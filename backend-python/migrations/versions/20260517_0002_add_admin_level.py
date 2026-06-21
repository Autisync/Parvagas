"""Add admin level to users and mark the configured super admin.

Revision ID: 20260517_0002
Revises: 20260517_0001
Create Date: 2026-05-17 00:00:02
"""
from typing import Sequence, Union
import os

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260517_0002"
down_revision: Union[str, None] = "20260517_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    users = sa.Table("users", metadata, autoload_with=bind)

    if "admin_level" not in users.c:
        op.add_column(
            "users",
            sa.Column(
                "admin_level",
                sa.String(32),
                nullable=False,
                server_default="moderator",
            ),
        )
        # SQLite cannot ALTER COLUMN ... DROP DEFAULT; the server_default is
        # harmless there and only matters for Postgres in production.
        if bind.dialect.name != "sqlite":
            op.alter_column("users", "admin_level", server_default=None)
        users = sa.Table("users", sa.MetaData(), autoload_with=bind)

    super_admin_email = (os.getenv("SUPER_ADMIN_EMAIL") or "admin@autisync.com").strip().lower()

    bind.execute(
        sa.update(users)
        .where(users.c.role == "admin")
        .values(admin_level="moderator")
    )
    bind.execute(
        sa.update(users)
        .where(users.c.email == super_admin_email)
        .values(admin_level="super-admin")
    )


def downgrade() -> None:
    op.drop_column("users", "admin_level")
