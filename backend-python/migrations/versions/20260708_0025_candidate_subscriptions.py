"""Add candidate_subscriptions table (Phase 4 premium AI tools).

Enforcement is off by default (CANDIDATE_PREMIUM_ENABLED=false) — this table
exists so entitlement can be turned on later without another migration, not
because billing is live today.

Revision ID: 20260708_0025
Revises: 20260707_0024
Create Date: 2026-07-08 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260708_0025"
down_revision: Union[str, None] = "20260707_0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "candidate_subscriptions" in inspector.get_table_names():
        return

    op.create_table(
        "candidate_subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("candidate_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("plan_code", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("candidate_subscriptions")
