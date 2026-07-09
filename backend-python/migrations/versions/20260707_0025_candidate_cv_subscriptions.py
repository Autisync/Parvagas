"""Candidate CV Builder subscription table.

Revision ID: 20260707_0025
Revises: 20260707_0024
Create Date: 2026-07-07 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260707_0025"
down_revision: Union[str, None] = "20260707_0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("candidate_cv_subscriptions"):
        op.create_table(
            "candidate_cv_subscriptions",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("candidate_profile_id", sa.String(36), nullable=False),
            # plan_tier: free | pro | premium
            sa.Column("plan_tier", sa.String(20), nullable=False, server_default="free"),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("current_period_end", sa.DateTime(), nullable=True),
            sa.Column("transaction_reference", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_candidate_cv_subscriptions_candidate_profile_id",
            "candidate_cv_subscriptions", ["candidate_profile_id"]
        )
        op.create_index(
            "ix_candidate_cv_subscriptions_transaction_reference",
            "candidate_cv_subscriptions", ["transaction_reference"]
        )


def downgrade() -> None:
    op.drop_table("candidate_cv_subscriptions")
