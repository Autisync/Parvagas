"""Add grace_notified_at to subscriptions and candidate_cv_subscriptions —
renewal-lapse grace period tracking (Wave P4, EXECUTION_PLAN_LEGAL_AND_
PAYMENTS.md).

Revision ID: 20260721_0060
Revises: 20260721_0059
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0060"
down_revision: Union[str, None] = "20260721_0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    sub_columns = {c["name"] for c in inspector.get_columns("subscriptions")}
    if "grace_notified_at" not in sub_columns:
        op.add_column("subscriptions", sa.Column("grace_notified_at", sa.DateTime(), nullable=True))

    cv_sub_columns = {c["name"] for c in inspector.get_columns("candidate_cv_subscriptions")}
    if "grace_notified_at" not in cv_sub_columns:
        op.add_column("candidate_cv_subscriptions", sa.Column("grace_notified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_cv_subscriptions", "grace_notified_at")
    op.drop_column("subscriptions", "grace_notified_at")
