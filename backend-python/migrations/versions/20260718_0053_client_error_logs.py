"""Create client_error_logs — frontend runtime errors reported by
src/lib/errorMonitoring.ts via the new public POST /api/v1/events/client-errors
endpoint. Every string column is sized to match the application-layer
truncation applied before insert (message<=500, path<=300, details<=1000
JSON, user_agent<=400) so a malicious payload can't grow a row past a
fixed bound even on a database that doesn't enforce VARCHAR length.

Revision ID: 20260718_0053
Revises: 20260718_0052
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0053"
down_revision: Union[str, None] = "20260718_0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "client_error_logs" not in inspector.get_table_names():
        op.create_table(
            "client_error_logs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("level", sa.String(length=10), nullable=False),
            sa.Column("message", sa.String(length=500), nullable=False),
            sa.Column("path", sa.String(length=300), nullable=True),
            sa.Column("details", sa.String(length=1000), nullable=True),
            sa.Column("user_agent", sa.String(length=400), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_client_error_logs_level", "client_error_logs", ["level"])


def downgrade() -> None:
    op.drop_index("ix_client_error_logs_level", table_name="client_error_logs")
    op.drop_table("client_error_logs")
