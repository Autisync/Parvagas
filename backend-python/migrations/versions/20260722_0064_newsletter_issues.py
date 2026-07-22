"""Add newsletter_subscribers.unsubscribe_token (backfilled) and create
newsletter_issues — admin compose/send feature for the newsletter, plus the
one-click unsubscribe link every issue email must carry (there was
previously no way for a subscriber to ever opt out).

Revision ID: 20260722_0064
Revises: 20260721_0063
Create Date: 2026-07-22 00:00:00
"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260722_0064"
down_revision: Union[str, None] = "20260721_0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    subscriber_columns = {c["name"] for c in inspector.get_columns("newsletter_subscribers")}
    if "unsubscribe_token" not in subscriber_columns:
        op.add_column("newsletter_subscribers", sa.Column("unsubscribe_token", sa.String(length=64), nullable=True))

        subscribers_table = sa.table(
            "newsletter_subscribers",
            sa.column("id", sa.String),
            sa.column("unsubscribe_token", sa.String),
        )
        existing_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM newsletter_subscribers")).fetchall()]
        for subscriber_id in existing_ids:
            bind.execute(
                subscribers_table.update()
                .where(subscribers_table.c.id == subscriber_id)
                .values(unsubscribe_token=secrets.token_urlsafe(32))
            )

        op.alter_column("newsletter_subscribers", "unsubscribe_token", nullable=False)
        op.create_index(
            "ix_newsletter_subscribers_unsubscribe_token", "newsletter_subscribers", ["unsubscribe_token"], unique=True
        )

    if "newsletter_issues" not in inspector.get_table_names():
        op.create_table(
            "newsletter_issues",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("subject", sa.String(length=255), nullable=False),
            sa.Column("intro_paragraphs", sa.Text(), nullable=False),
            sa.Column("include_recent_jobs", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("recent_jobs_count", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("queued_count", sa.Integer(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("newsletter_issues")
    op.drop_index("ix_newsletter_subscribers_unsubscribe_token", table_name="newsletter_subscribers")
    op.drop_column("newsletter_subscribers", "unsubscribe_token")
