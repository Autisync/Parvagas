"""Add plans.api_access_included (overnight-audit W5.4) — gates ApiKey
creation and every API-key-authenticated applications-feed request behind
the Business plan, same shape as 20260723_0070's candidate_search_included.

Revision ID: 20260723_0073
Revises: 20260723_0072
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0073"
down_revision: Union[str, None] = "20260723_0072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("plans")}

    if "api_access_included" not in columns:
        op.add_column(
            "plans",
            sa.Column("api_access_included", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.alter_column("plans", "api_access_included", server_default=None)

    bind.execute(
        sa.text("UPDATE plans SET api_access_included = :val WHERE code = :code"),
        {"val": True, "code": "business"},
    )


def downgrade() -> None:
    op.drop_column("plans", "api_access_included")
