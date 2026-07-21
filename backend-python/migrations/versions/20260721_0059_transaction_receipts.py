"""Add receipt_number/refunded_at/refund_reference to transactions — numbered
receipts and refund tracking (Wave P3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).

Revision ID: 20260721_0059
Revises: 20260721_0058
Create Date: 2026-07-21 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_0059"
down_revision: Union[str, None] = "20260721_0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("transactions")}

    if "receipt_number" not in columns:
        op.add_column("transactions", sa.Column("receipt_number", sa.String(length=30), nullable=True))
        op.create_index("ix_transactions_receipt_number", "transactions", ["receipt_number"], unique=True)
    if "refunded_at" not in columns:
        op.add_column("transactions", sa.Column("refunded_at", sa.DateTime(), nullable=True))
    if "refund_reference" not in columns:
        op.add_column("transactions", sa.Column("refund_reference", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "refund_reference")
    op.drop_column("transactions", "refunded_at")
    op.drop_index("ix_transactions_receipt_number", table_name="transactions")
    op.drop_column("transactions", "receipt_number")
