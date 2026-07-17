"""Add users.tokens_revoked_at — backs the admin force-logout action and
the real refresh-token flow (RefreshToken table already existed, unused,
since migration 20260602_0005).

Revision ID: 20260717_0044
Revises: 20260717_0043
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0044"
down_revision: Union[str, None] = "20260717_0043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("users")}

    if "tokens_revoked_at" not in columns:
        op.add_column("users", sa.Column("tokens_revoked_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "tokens_revoked_at")
