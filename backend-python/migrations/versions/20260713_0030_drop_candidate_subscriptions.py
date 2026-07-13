"""Drop candidate_subscriptions (C4, EXECUTION_PLAN_NATIVE_CV_BUILDER.md).

This table existed solely to back app.services.candidate_billing_service's
premium-AI-tools entitlement check, was never wired to any payment flow,
and duplicated CandidateCVSubscription (candidate_profile_id, plan_tier
free|pro|premium, status, current_period_end) — the table the CV builder's
own pro/premium tiers already use with a real payments.py flow behind it.
The entitlement check now reads that table instead (paid tier = pro or
premium, "free" does not grant access).

Dark-release safety: CANDIDATE_PREMIUM_ENABLED defaults false, so this
table was never read in production regardless of its contents — dropping
it changes no live behavior.

Revision ID: 20260713_0030
Revises: 20260712_0029
Create Date: 2026-07-13 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_0030"
down_revision: Union[str, None] = "20260712_0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("candidate_subscriptions")


def downgrade() -> None:
    op.create_table(
        "candidate_subscriptions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("candidate_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("plan_code", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
