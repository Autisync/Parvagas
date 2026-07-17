"""Drop job_matches — dead feature. Nothing ever wrote to this table (no
candidate/job matching job populated it) and its only reader, GET
/resumes/matches, has been deleted; the live, working heuristic is
GET /candidates/jobs/recommended, which never touched this table at all.

Revision ID: 20260717_0046
Revises: 20260717_0045
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0046"
down_revision: Union[str, None] = "20260717_0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "job_matches" in inspector.get_table_names():
        op.drop_table("job_matches")


def downgrade() -> None:
    op.create_table(
        "job_matches",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("candidate_profile_id", sa.String(length=36), sa.ForeignKey("candidate_profiles.id"), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("match_percentage", sa.Float(), nullable=True),
        sa.Column("skills_gap", sa.Text(), nullable=True),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
