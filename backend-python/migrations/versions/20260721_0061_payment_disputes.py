"""Create payment_disputes and payment_dispute_messages — Wave D,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md. Implements the state machine defined
in fluxo-resolucao-disputas.md.

Revision ID: 20260721_0061
Revises: 20260721_0060
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0061"
down_revision: Union[str, None] = "20260721_0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "payment_disputes" not in inspector.get_table_names():
        op.create_table(
            "payment_disputes",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("transaction_id", sa.String(length=36), sa.ForeignKey("transactions.id"), nullable=False),
            sa.Column("filed_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("category", sa.String(length=30), nullable=False, server_default="other"),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("assigned_admin_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("refund_amount", sa.Float(), nullable=True),
            sa.Column("info_requested_at", sa.DateTime(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("resolved_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_payment_disputes_transaction_id", "payment_disputes", ["transaction_id"])
        op.create_index("ix_payment_disputes_filed_by_user_id", "payment_disputes", ["filed_by_user_id"])
        op.create_index("ix_payment_disputes_status", "payment_disputes", ["status"])

    if "payment_dispute_messages" not in inspector.get_table_names():
        op.create_table(
            "payment_dispute_messages",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("dispute_id", sa.String(length=36), sa.ForeignKey("payment_disputes.id"), nullable=False),
            sa.Column("template_code", sa.String(length=20), nullable=True),
            sa.Column("subject", sa.String(length=255), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("is_internal_note", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("sent_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_payment_dispute_messages_dispute_id", "payment_dispute_messages", ["dispute_id"])


def downgrade() -> None:
    op.drop_table("payment_dispute_messages")
    op.drop_table("payment_disputes")
