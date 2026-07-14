"""Rename candidate_scores.metadata to score_metadata to match the model.

Revision ID: 20260714_0036
Revises: 20260713_0035
Create Date: 2026-07-14 13:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260714_0036"
down_revision: Union[str, None] = "20260713_0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 20260602_0005 created this column as "metadata", but
    # app.models.CandidateScore has always declared it as `score_metadata`
    # (SQLAlchemy declarative models reserve `metadata` as the class
    # attribute holding table schema info, so the model was written to
    # avoid the collision — the migration just never matched). Every read/
    # write through the ORM has been targeting a column that doesn't exist:
    # POST /resumes/score 500s with psycopg.errors.UndefinedColumn.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("candidate_scores")}
    if "score_metadata" in columns:
        return
    if "metadata" in columns:
        op.alter_column("candidate_scores", "metadata", new_column_name="score_metadata")
    else:
        op.add_column("candidate_scores", sa.Column("score_metadata", sa.Text(), nullable=True))


def downgrade() -> None:
    op.alter_column("candidate_scores", "score_metadata", new_column_name="metadata")
