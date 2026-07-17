"""Support notification-bell wiring: support_messages table + candidate
notification preferences column.

Two independent additions that both close gaps in the same feature audit:
- The "message admin" form in the notification bell persisted nothing and
  reached no one — support_messages gives it a real row, paired with an
  admin bell notification created in app/api/v1/notifications.py.
- Candidate notification preferences (GET/PATCH /candidates/notifications/
  preferences) were echoed back but never stored.

Revision ID: 20260717_0040
Revises: 20260717_0039
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0040"
down_revision: Union[str, None] = "20260717_0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "support_messages" not in inspector.get_table_names():
        op.create_table(
            "support_messages",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("sender_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("sender_role", sa.String(length=20), nullable=True),
            sa.Column("recipient_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reason", sa.String(length=255), nullable=True),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_support_messages_sender_user_id", "support_messages", ["sender_user_id"])

    candidate_columns = {c["name"] for c in inspector.get_columns("candidate_profiles")}
    if "notification_preferences" not in candidate_columns:
        op.add_column("candidate_profiles", sa.Column("notification_preferences", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_profiles", "notification_preferences")
    op.drop_index("ix_support_messages_sender_user_id", table_name="support_messages")
    op.drop_table("support_messages")
