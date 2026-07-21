"""Add cancel_requested_at to subscriptions and candidate_cv_subscriptions
— self-service cancellation, cancel-at-period-end (Wave P2,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).

Revision ID: 20260721_0058
Revises: 20260721_0057
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0058"
down_revision: Union[str, None] = "20260721_0057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    sub_columns = {c["name"] for c in inspector.get_columns("subscriptions")}
    if "cancel_requested_at" not in sub_columns:
        op.add_column("subscriptions", sa.Column("cancel_requested_at", sa.DateTime(), nullable=True))

    cv_sub_columns = {c["name"] for c in inspector.get_columns("candidate_cv_subscriptions")}
    if "cancel_requested_at" not in cv_sub_columns:
        op.add_column("candidate_cv_subscriptions", sa.Column("cancel_requested_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_cv_subscriptions", "cancel_requested_at")
    op.drop_column("subscriptions", "cancel_requested_at")
