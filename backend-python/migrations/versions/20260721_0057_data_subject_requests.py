"""Create data_subject_requests — GDPR/Lei n.º 22/11 export + erasure
requests (Wave C3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).

Revision ID: 20260721_0057
Revises: 20260720_0056
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0057"
down_revision: Union[str, None] = "20260720_0056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "data_subject_requests" not in inspector.get_table_names():
        op.create_table(
            "data_subject_requests",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("request_type", sa.String(length=20), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("admin_note", sa.Text(), nullable=True),
            sa.Column("reviewed_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_data_subject_requests_user_id", "data_subject_requests", ["user_id"])
        op.create_index("ix_data_subject_requests_status", "data_subject_requests", ["status"])


def downgrade() -> None:
    op.drop_table("data_subject_requests")
