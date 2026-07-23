"""Add plans.candidate_search_included (overnight-audit W5.2) — the
Business plan's marketing copy already advertises "Acesso à base de CVs"
(payments.py's _DEFAULT_PLANS) with zero backend enforcement; this makes
that real. Backfills true for the business plan code specifically.

Revision ID: 20260723_0070
Revises: 20260723_0069
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0070"
down_revision: Union[str, None] = "20260723_0069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("plans")}

    if "candidate_search_included" not in columns:
        op.add_column(
            "plans",
            sa.Column("candidate_search_included", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.alter_column("plans", "candidate_search_included", server_default=None)

    bind.execute(
        sa.text("UPDATE plans SET candidate_search_included = :val WHERE code = :code"),
        {"val": True, "code": "business"},
    )


def downgrade() -> None:
    op.drop_column("plans", "candidate_search_included")
