"""Add application_messages table (overnight-audit W5.1) — a company's only
way to ask a candidate a clarifying question was emailing them manually
outside the platform; status-change emails only ever sent the fixed
template. One thread per JobApplication.

Revision ID: 20260723_0068
Revises: 20260723_0067
Create Date: 2026-07-23 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0068"
down_revision: Union[str, None] = "20260723_0067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "application_messages" in inspector.get_table_names():
        return

    op.create_table(
        "application_messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("application_id", sa.String(length=36), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("sender_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_role", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_application_messages_application_id", "application_messages", ["application_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_application_messages_application_id", table_name="application_messages")
    op.drop_table("application_messages")
