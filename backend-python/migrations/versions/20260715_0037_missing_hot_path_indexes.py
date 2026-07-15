"""Add missing indexes on columns that hot-path queries actually filter on.

Scalability audit (2026-07-15) of the last 48h of changes flagged that:
- resumes.candidate_profile_id is queried by every resume list/get/quota
  check (assert_resume_quota does a COUNT(*) filtered on this column with
  no index — a full table scan on every create/duplicate/restore call).
- resume_versions.resume_id is queried by _snapshot_due/_create_resume_version
  (COUNT()/MAX() aggregates) on every single autosave — same full-scan issue,
  hit far more often than the resumes-table one.
- security_events.created_at is the exact column every burst-detection query
  (_check_login_burst, _alert_recently_sent) and the admin 24h summary filter
  on — the query meant to detect an attack degrades worst under one.

None of these are correctness bugs (results are right, just slow at scale);
purely additive indexes, safe to add online, no data migration.

Revision ID: 20260715_0037
Revises: 20260714_0036
Create Date: 2026-07-15 09:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260715_0037"
down_revision: Union[str, None] = "20260714_0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_index_names(inspector, table_name: str) -> set[str]:
    return {ix["name"] for ix in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "ix_resumes_candidate_profile_id" not in _existing_index_names(inspector, "resumes"):
        op.create_index("ix_resumes_candidate_profile_id", "resumes", ["candidate_profile_id"])

    if "ix_resume_versions_resume_id" not in _existing_index_names(inspector, "resume_versions"):
        op.create_index("ix_resume_versions_resume_id", "resume_versions", ["resume_id"])

    if "ix_security_events_created_at" not in _existing_index_names(inspector, "security_events"):
        op.create_index("ix_security_events_created_at", "security_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_security_events_created_at", table_name="security_events")
    op.drop_index("ix_resume_versions_resume_id", table_name="resume_versions")
    op.drop_index("ix_resumes_candidate_profile_id", table_name="resumes")
