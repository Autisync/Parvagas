"""Add ats_pipeline_items.company_id and .notes — every ATS endpoint has
been 500ing since the table was created (migration 20260602_0005): the
Pydantic schemas and query filters reference `ATSPipelineItem.company_id`,
which never existed on the model, plus a `sort_order` column that was
actually named `position` on ATSStage. This migration fixes the missing
column; the schema/endpoint fixes are a code-only change alongside it.

Revision ID: 20260717_0045
Revises: 20260717_0044
Create Date: 2026-07-17 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260717_0045"
down_revision: Union[str, None] = "20260717_0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("ats_pipeline_items")}

    if "notes" not in columns:
        op.add_column("ats_pipeline_items", sa.Column("notes", sa.Text(), nullable=True))

    if "company_id" not in columns:
        op.add_column("ats_pipeline_items", sa.Column("company_id", sa.String(length=36), nullable=True))
        # Backfill from the joined stage — every endpoint that could have
        # written a row already required a matching ATSStage, so this covers
        # any pre-existing data safely.
        op.execute(
            """
            UPDATE ats_pipeline_items
            SET company_id = ats_stages.company_id
            FROM ats_stages
            WHERE ats_pipeline_items.stage_id = ats_stages.id
            """
        )
        op.alter_column("ats_pipeline_items", "company_id", nullable=False)
        op.create_foreign_key(
            "fk_ats_pipeline_items_company_id", "ats_pipeline_items", "companies", ["company_id"], ["id"]
        )
        op.create_index("ix_ats_pipeline_items_company_id", "ats_pipeline_items", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_ats_pipeline_items_company_id", table_name="ats_pipeline_items")
    op.drop_constraint("fk_ats_pipeline_items_company_id", "ats_pipeline_items", type_="foreignkey")
    op.drop_column("ats_pipeline_items", "company_id")
    op.drop_column("ats_pipeline_items", "notes")
