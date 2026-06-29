"""Add split-skill columns to candidate_profiles.

The rules-first CV parser (Sub-task 1) segments skills into four buckets:
hard_skills, techniques, tools, languages.  This migration adds three new
TEXT columns (JSON arrays as strings) for the first three buckets.
`languages` already exists.  The existing `skills` column is kept as a flat
combined list for backward compatibility.

Revision ID: 20260629_0012
Revises: 20260521_0011
Create Date: 2026-06-29 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260629_0012"
down_revision: Union[str, None] = "20260521_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("candidate_profiles")}
    for col in ("hard_skills", "techniques", "tools"):
        if col not in cols:
            op.add_column("candidate_profiles", sa.Column(col, sa.Text(), nullable=True))


def downgrade() -> None:
    for col in ("hard_skills", "techniques", "tools"):
        op.drop_column("candidate_profiles", col)
