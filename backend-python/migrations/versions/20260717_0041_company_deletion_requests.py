"""Create company_deletion_requests table.

Replaces the in-memory `_deletion_requests` list in companies.py (wiped on
every restart, not shared across worker processes) with a durable table —
same pattern as the earlier audit-log/admin-actions fix this session.

Revision ID: 20260717_0041
Revises: 20260717_0040
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0041"
down_revision: Union[str, None] = "20260717_0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "company_deletion_requests" not in inspector.get_table_names():
        op.create_table(
            "company_deletion_requests",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("requested_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("requested_by_admin_level", sa.String(length=20), nullable=True),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending_admin_approval"),
            sa.Column("reviewed_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_company_deletion_requests_company_id", "company_deletion_requests", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_company_deletion_requests_company_id", table_name="company_deletion_requests")
    op.drop_table("company_deletion_requests")
