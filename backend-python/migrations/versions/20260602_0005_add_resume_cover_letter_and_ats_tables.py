"""Add resume, cover letter, ATS, scoring, and audit tables.

Revision ID: 20260602_0005
Revises: 20260519_0004
Create Date: 2026-06-02 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260602_0005"
down_revision: Union[str, None] = "20260519_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("resume_templates"):
        op.create_table(
            "resume_templates",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("slug", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("preview_url", sa.String(length=500), nullable=True),
            sa.Column("schema", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug", name=op.f("uq_resume_templates_slug")),
        )

    if not inspector.has_table("resumes"):
        op.create_table(
            "resumes",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_profile_id", sa.String(length=36), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("template_id", sa.String(length=36), nullable=True),
            sa.Column("data", sa.Text(), nullable=True),
            sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("share_slug", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.ForeignKeyConstraint(["template_id"], ["resume_templates.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("share_slug", name=op.f("uq_resumes_share_slug")),
        )

    if not inspector.has_table("resume_versions"):
        op.create_table(
            "resume_versions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("resume_id", sa.String(length=36), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("data", sa.Text(), nullable=True),
            sa.Column("change_summary", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"]),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("cover_letters"):
        op.create_table(
            "cover_letters",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_profile_id", sa.String(length=36), nullable=False),
            sa.Column("resume_id", sa.String(length=36), nullable=True),
            sa.Column("job_id", sa.String(length=36), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("language", sa.String(length=50), nullable=True),
            sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("candidate_scores"):
        op.create_table(
            "candidate_scores",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_profile_id", sa.String(length=36), nullable=False),
            sa.Column("resume_id", sa.String(length=36), nullable=True),
            sa.Column("overall_score", sa.Float(), nullable=True),
            sa.Column("skills_score", sa.Float(), nullable=True),
            sa.Column("experience_score", sa.Float(), nullable=True),
            sa.Column("formatting_score", sa.Float(), nullable=True),
            sa.Column("ats_score", sa.Float(), nullable=True),
            sa.Column("metadata", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.ForeignKeyConstraint(["resume_id"], ["resumes.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("job_matches"):
        op.create_table(
            "job_matches",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_profile_id", sa.String(length=36), nullable=False),
            sa.Column("job_id", sa.String(length=36), nullable=False),
            sa.Column("match_percentage", sa.Float(), nullable=True),
            sa.Column("skills_gap", sa.Text(), nullable=True),
            sa.Column("recommendation", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("ats_stages"):
        op.create_table(
            "ats_stages",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("company_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("color", sa.String(length=50), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("ats_pipeline_items"):
        op.create_table(
            "ats_pipeline_items",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("stage_id", sa.String(length=36), nullable=False),
            sa.Column("application_id", sa.String(length=36), nullable=True),
            sa.Column("candidate_profile_id", sa.String(length=36), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'active'")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["stage_id"], ["ats_stages.id"]),
            sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
            sa.ForeignKeyConstraint(["candidate_profile_id"], ["candidate_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not inspector.has_table("refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("token_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
        )

    if not inspector.has_table("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=True),
            sa.Column("action", sa.String(length=150), nullable=False),
            sa.Column("entity_type", sa.String(length=100), nullable=True),
            sa.Column("entity_id", sa.String(length=36), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("refresh_tokens")
    op.drop_table("ats_pipeline_items")
    op.drop_table("ats_stages")
    op.drop_table("job_matches")
    op.drop_table("candidate_scores")
    op.drop_table("cover_letters")
    op.drop_table("resume_versions")
    op.drop_table("resumes")
    op.drop_table("resume_templates")
