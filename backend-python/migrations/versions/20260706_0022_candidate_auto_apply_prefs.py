"""Add candidate_profiles.preferred_job_categories/auto_apply_opt_in.

Revision ID: 20260706_0022
Revises: 20260702_0021
Create Date: 2026-07-06 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260706_0022"
down_revision: Union[str, None] = "20260702_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("candidate_profiles")}
    if "preferred_job_categories" not in columns:
        op.add_column("candidate_profiles", sa.Column("preferred_job_categories", sa.Text(), nullable=True))
    if "auto_apply_opt_in" not in columns:
        op.add_column(
            "candidate_profiles",
            sa.Column("auto_apply_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    op.drop_column("candidate_profiles", "auto_apply_opt_in")
    op.drop_column("candidate_profiles", "preferred_job_categories")
