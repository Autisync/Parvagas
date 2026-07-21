"""Create compliance_checks — history of compliance-analyzer runs (Wave
L3b, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md). Every string column is sized
to match the application-layer truncation applied before insert, same
convention as 20260718_0053 (client_error_logs).

Revision ID: 20260720_0056
Revises: 20260720_0055
Create Date: 2026-07-20 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260720_0056"
down_revision: Union[str, None] = "20260720_0055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "compliance_checks" not in inspector.get_table_names():
        op.create_table(
            "compliance_checks",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("feature_name", sa.String(length=200), nullable=False),
            sa.Column("feature_description", sa.Text(), nullable=False),
            sa.Column("intake", sa.Text(), nullable=False),
            sa.Column("findings", sa.Text(), nullable=False),
            sa.Column("ai_notes", sa.Text(), nullable=True),
            sa.Column("severity_summary", sa.String(length=10), nullable=False, server_default="none"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("resolved_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_compliance_checks_severity_summary", "compliance_checks", ["severity_summary"])
        op.create_index("ix_compliance_checks_status", "compliance_checks", ["status"])


def downgrade() -> None:
    op.drop_table("compliance_checks")
