"""Add jobs.featured — lets admin pin/highlight a listing without touching
its moderation status/visibility.

Revision ID: 20260717_0043
Revises: 20260717_0042
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0043"
down_revision: Union[str, None] = "20260717_0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("jobs")}

    if "featured" not in columns:
        op.add_column(
            "jobs",
            sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("jobs", "featured")
