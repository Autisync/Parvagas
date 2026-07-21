"""Add plans.max_active_jobs — server-side enforcement of the per-plan
active-job caps already advertised on the pricing page (free: 1 vaga ativa,
starter: 5 vagas ativas, business: vagas ilimitadas). Backfills the seeded
plan rows by code; -1 means unlimited (mirrors candidate_cv_plans.max_resumes's
-1 convention).

Revision ID: 20260721_0062
Revises: 20260721_0061
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0062"
down_revision: Union[str, None] = "20260721_0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# code -> max_active_jobs (-1 = unlimited). featured_post is a one-time boost
# add-on, not a recurring job-count plan — set to -1 (never binding) as
# defense in depth; company_billing_service is expected to skip it entirely
# when resolving the company's operative plan.
_BACKFILL = {"free": 1, "starter": 5, "business": -1, "featured_post": -1}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {c["name"] for c in inspector.get_columns("plans")}
    if "max_active_jobs" not in columns:
        op.add_column(
            "plans",
            sa.Column("max_active_jobs", sa.Integer(), nullable=False, server_default="1"),
        )

    plans = sa.table("plans", sa.column("code", sa.String), sa.column("max_active_jobs", sa.Integer))
    for code, limit in _BACKFILL.items():
        op.execute(plans.update().where(plans.c.code == code).values(max_active_jobs=limit))


def downgrade() -> None:
    op.drop_column("plans", "max_active_jobs")
