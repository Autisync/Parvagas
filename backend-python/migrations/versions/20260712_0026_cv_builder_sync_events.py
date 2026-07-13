"""Add CV Builder sync event ledger table.

Revision ID: 20260712_0026
Revises: 20260708_0025
Create Date: 2026-07-12 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260712_0026"
down_revision: Union[str, None] = "20260708_0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("cv_builder_sync_events"):
        op.create_table(
            "cv_builder_sync_events",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("event_id", sa.String(80), nullable=False),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("external_user_id", sa.String(255), nullable=False),
            sa.Column("external_resume_id", sa.String(255), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id"),
        )
        op.create_index("ix_cv_builder_sync_events_event_id", "cv_builder_sync_events", ["event_id"])
        op.create_index("ix_cv_builder_sync_events_external_user_id", "cv_builder_sync_events", ["external_user_id"])
        op.create_index("ix_cv_builder_sync_events_external_resume_id", "cv_builder_sync_events", ["external_resume_id"])


def downgrade() -> None:
    op.drop_table("cv_builder_sync_events")
