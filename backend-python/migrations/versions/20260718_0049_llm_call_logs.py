"""Create llm_call_logs — records one row per call through
app.services.llm_service.chat_json_request(), the shared low-level HTTP
path every AI feature (auto-apply scoring, CV keyword injection, resume
rewrite free/paid tiers) funnels through. llm_service.py previously
recorded nothing, so there was no way to see AI usage per feature.

Revision ID: 20260718_0049
Revises: 20260718_0048
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0049"
down_revision: Union[str, None] = "20260718_0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "llm_call_logs" not in inspector.get_table_names():
        op.create_table(
            "llm_call_logs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("feature", sa.String(length=60), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="unknown"),
            sa.Column("model", sa.String(length=120), nullable=True),
            sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_llm_call_logs_feature", "llm_call_logs", ["feature"])


def downgrade() -> None:
    op.drop_index("ix_llm_call_logs_feature", table_name="llm_call_logs")
    op.drop_table("llm_call_logs")
