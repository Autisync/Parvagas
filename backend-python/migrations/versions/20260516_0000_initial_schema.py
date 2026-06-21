"""Initial base schema (root migration).

Creates every base table the application relies on. Authored by hand so that a
fresh database can be brought up with ``alembic upgrade head`` alone, instead of
depending on ``Base.metadata.create_all()`` at import time.

Every table is created behind an ``inspector.has_table`` guard so this migration
is safe to run against databases that were previously created by ``create_all``
(it simply no-ops for already-present tables). The ``admin_level`` column on
``users`` is intentionally NOT created here — it is added by ``20260517_0002`` to
preserve the historical chain.

Revision ID: 20260516_0000
Revises:
Create Date: 2026-05-16 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260516_0000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_role = sa.Enum("candidate", "company", "admin", name="userrole")

    # ── users ────────────────────────────────────────────────────────────────
    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("role", user_role, nullable=False, server_default="candidate"),
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_verified_at", sa.DateTime(), nullable=True),
            sa.Column("suspended", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("locked_until", sa.DateTime(), nullable=True),
            *_ts_columns(),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── candidate_profiles ───────────────────────────────────────────────────
    if not inspector.has_table("candidate_profiles"):
        op.create_table(
            "candidate_profiles",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("first_name", sa.String(length=255), nullable=True),
            sa.Column("last_name", sa.String(length=255), nullable=True),
            sa.Column("phone", sa.String(length=20), nullable=True),
            sa.Column("location", sa.String(length=255), nullable=True),
            sa.Column("postcode", sa.String(length=20), nullable=True),
            sa.Column("linkedin_url", sa.String(length=500), nullable=True),
            sa.Column("portfolio_url", sa.String(length=500), nullable=True),
            sa.Column("github_url", sa.String(length=500), nullable=True),
            sa.Column("professional_summary", sa.Text(), nullable=True),
            sa.Column("job_title", sa.String(length=255), nullable=True),
            sa.Column("years_of_experience", sa.Integer(), nullable=True),
            sa.Column("skills", sa.Text(), nullable=True),
            sa.Column("work_experience", sa.Text(), nullable=True),
            sa.Column("education", sa.Text(), nullable=True),
            sa.Column("certifications", sa.Text(), nullable=True),
            sa.Column("languages", sa.Text(), nullable=True),
            sa.Column("has_completed_onboarding", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("has_seen_tutorial", sa.Boolean(), nullable=False, server_default=sa.false()),
            *_ts_columns(),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )

    # ── companies ────────────────────────────────────────────────────────────
    if not inspector.has_table("companies"):
        op.create_table(
            "companies",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("legal_name", sa.String(length=255), nullable=True),
            sa.Column("nif", sa.String(length=50), nullable=True),
            sa.Column("phone", sa.String(length=20), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("website", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="pending_verification"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("logo_url", sa.String(length=500), nullable=True),
            *_ts_columns(),
            sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("nif"),
        )

    # ── cv_uploads ───────────────────────────────────────────────────────────
    if not inspector.has_table("cv_uploads"):
        op.create_table(
            "cv_uploads",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("candidate_id", sa.String(length=36), nullable=False),
            sa.Column("file_name", sa.String(length=255), nullable=False),
            sa.Column("file_path", sa.String(length=500), nullable=False),
            sa.Column("file_size", sa.Integer(), nullable=False),
            sa.Column("mime_type", sa.String(length=100), nullable=False),
            sa.Column("raw_text", sa.Text(), nullable=True),
            sa.Column("parsed_data", sa.Text(), nullable=True),
            sa.Column("parse_confidence", sa.Float(), nullable=True),
            sa.Column("parse_status", sa.String(length=50), nullable=False, server_default="pending"),
            sa.Column("parse_error", sa.Text(), nullable=True),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
            *_ts_columns(),
            sa.ForeignKeyConstraint(["candidate_id"], ["candidate_profiles.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── ad_campaigns ─────────────────────────────────────────────────────────
    if not inspector.has_table("ad_campaigns"):
        op.create_table(
            "ad_campaigns",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("placement", sa.String(length=100), nullable=False),
            sa.Column("link", sa.String(length=1000), nullable=True),
            sa.Column("image_url", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("flagged", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("flag_reason", sa.Text(), nullable=True),
            sa.Column("pause_reason", sa.Text(), nullable=True),
            sa.Column("budget", sa.Float(), nullable=True),
            sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("impressions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("start_date", sa.DateTime(), nullable=True),
            sa.Column("end_date", sa.DateTime(), nullable=True),
            sa.Column("last_served_at", sa.DateTime(), nullable=True),
            *_ts_columns(),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_ad_campaigns_placement", "ad_campaigns", ["placement"], unique=False)

    # ── token tables ─────────────────────────────────────────────────────────
    for table in ("email_verification_tokens", "password_reset_tokens"):
        if not inspector.has_table(table):
            op.create_table(
                table,
                sa.Column("id", sa.String(length=36), nullable=False),
                sa.Column("user_id", sa.String(length=36), nullable=False),
                sa.Column("token_hash", sa.String(length=255), nullable=False),
                sa.Column("expires_at", sa.DateTime(), nullable=False),
                sa.Column("used_at", sa.DateTime(), nullable=True),
                *_ts_columns(),
                sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
                sa.PrimaryKeyConstraint("id"),
                sa.UniqueConstraint("token_hash"),
            )


def downgrade() -> None:
    op.drop_table("password_reset_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_index("ix_ad_campaigns_placement", table_name="ad_campaigns")
    op.drop_table("ad_campaigns")
    op.drop_table("cv_uploads")
    op.drop_table("companies")
    op.drop_table("candidate_profiles")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    sa.Enum(name="userrole").drop(op.get_bind(), checkfirst=True)
