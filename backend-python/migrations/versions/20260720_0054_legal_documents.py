"""Create legal_documents, legal_document_versions, legal_acceptances.

Foundation for the versioned legal-document CMS (Wave L,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md): documents (ToS, Privacy Policy,
DPA, ...) are edited/published as immutable versions instead of hardcoded
pages, and user consent (legal_acceptances) points at one specific
version forever — the proof-of-consent record the current signup flow is
missing entirely (acceptTerms/acceptPrivacy are sent by the frontend today
but never read or persisted by the backend).

created_at/updated_at are set explicitly on every insert below (not left
to the ORM's Python-side default) — see 20260718_0051's post-mortem in
this same migrations/versions/ directory for exactly why a raw Core
insert into a NOT NULL timestamp column without them crash-loops the app.

Revision ID: 20260720_0054
Revises: 20260718_0053
Create Date: 2026-07-20 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260720_0054"
down_revision: Union[str, None] = "20260718_0053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "legal_documents" not in inspector.get_table_names():
        op.create_table(
            "legal_documents",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("slug", sa.String(length=80), nullable=False, unique=True),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("category", sa.String(length=40), nullable=False),
            sa.Column("audience", sa.String(length=20), nullable=False, server_default="public"),
            sa.Column("requires_acceptance", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_legal_documents_slug", "legal_documents", ["slug"], unique=True)
        op.create_index("ix_legal_documents_category", "legal_documents", ["category"])
        op.create_index("ix_legal_documents_audience", "legal_documents", ["audience"])

    if "legal_document_versions" not in inspector.get_table_names():
        op.create_table(
            "legal_document_versions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("document_id", sa.String(length=36), sa.ForeignKey("legal_documents.id"), nullable=False),
            sa.Column("version_label", sa.String(length=40), nullable=False),
            sa.Column("body_markdown", sa.Text(), nullable=False),
            sa.Column("effective_date", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("published_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_legal_document_versions_document_id", "legal_document_versions", ["document_id"])
        op.create_index("ix_legal_document_versions_status", "legal_document_versions", ["status"])

    if "legal_acceptances" not in inspector.get_table_names():
        op.create_table(
            "legal_acceptances",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("document_version_id", sa.String(length=36), sa.ForeignKey("legal_document_versions.id"), nullable=False),
            sa.Column("context", sa.String(length=60), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=400), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_legal_acceptances_user_id", "legal_acceptances", ["user_id"])
        op.create_index("ix_legal_acceptances_document_version_id", "legal_acceptances", ["document_version_id"])


def downgrade() -> None:
    op.drop_table("legal_acceptances")
    op.drop_table("legal_document_versions")
    op.drop_table("legal_documents")
