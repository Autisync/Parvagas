"""Add job_match_proposals table (auto-apply review queue).

Revision ID: 20260707_0023
Revises: 20260706_0022
Create Date: 2026-07-07 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260707_0023"
down_revision: Union[str, None] = "20260706_0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "job_match_proposals" in inspector.get_table_names():
        return

    op.create_table(
        "job_match_proposals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("candidate_id", sa.String(36), sa.ForeignKey("candidate_profiles.id"), nullable=False, index=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id"), nullable=False, index=True),
        sa.Column("match_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("match_reasons", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("resulting_application_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint(
        "uq_job_match_proposal_candidate_job", "job_match_proposals", ["candidate_id", "job_id"]
    )


def downgrade() -> None:
    op.drop_table("job_match_proposals")
