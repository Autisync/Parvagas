"""Create email_logs — records one row per attempted send through
app.workers.tasks.send_templated_email, the shared dispatcher every
templated outbound email in the app funnels through. Recipients are
hashed (sha256), never stored raw — send-volume/failure-rate per template
is the useful deliverability signal, not who received what.

Revision ID: 20260718_0052
Revises: 20260718_0051
Create Date: 2026-07-18 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_0052"
down_revision: Union[str, None] = "20260718_0051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "email_logs" not in inspector.get_table_names():
        op.create_table(
            "email_logs",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("template", sa.String(length=120), nullable=False),
            sa.Column("recipient_hash", sa.String(length=64), nullable=True),
            sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_email_logs_template", "email_logs", ["template"])
        op.create_index("ix_email_logs_recipient_hash", "email_logs", ["recipient_hash"])


def downgrade() -> None:
    op.drop_index("ix_email_logs_recipient_hash", table_name="email_logs")
    op.drop_index("ix_email_logs_template", table_name="email_logs")
    op.drop_table("email_logs")
