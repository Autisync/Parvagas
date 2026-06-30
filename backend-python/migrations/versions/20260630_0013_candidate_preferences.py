"""Add job-preference columns to candidate_profiles.

The profile page collects three preference fields — preferred job type,
expected monthly salary (AOA) and availability — but there were no columns
to store them, so every save silently dropped the data and the profile
could never reach 100% complete. This migration adds the columns.

Revision ID: 20260630_0013
Revises: 20260629_0012
Create Date: 2026-06-30 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260630_0013"
down_revision: Union[str, None] = "20260629_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("candidate_profiles")}
    if "preferred_job_type" not in cols:
        op.add_column("candidate_profiles", sa.Column("preferred_job_type", sa.String(length=50), nullable=True))
    if "expected_salary_aoa" not in cols:
        op.add_column("candidate_profiles", sa.Column("expected_salary_aoa", sa.Integer(), nullable=True))
    if "availability" not in cols:
        op.add_column("candidate_profiles", sa.Column("availability", sa.String(length=50), nullable=True))


def downgrade() -> None:
    for col in ("preferred_job_type", "expected_salary_aoa", "availability"):
        op.drop_column("candidate_profiles", col)
