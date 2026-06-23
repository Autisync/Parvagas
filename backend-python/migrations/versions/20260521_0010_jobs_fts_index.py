"""GIN full-text index on jobs (title+description+skills+category).

Revision ID: 20260521_0010
Revises: 20260521_0009
Create Date: 2026-05-21 00:00:10
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260521_0010"
down_revision: Union[str, None] = "20260521_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Must match the expression used in app/api/v1/jobs.py exactly so the planner uses it.
_FTS = (
    "to_tsvector('portuguese', coalesce(title,'') || ' ' || "
    "coalesce(description,'') || ' ' || coalesce(required_skills,'') || ' ' || "
    "coalesce(category,''))"
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # FTS index is Postgres-only; sqlite/dev falls back to ilike
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_jobs_fts ON jobs USING gin ({_FTS})")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP INDEX IF EXISTS ix_jobs_fts")
