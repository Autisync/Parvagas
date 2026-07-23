"""Add candidate_profiles.discoverable_opt_in and seed the consent
document that gates turning it on (overnight-audit W5.2) — companies
previously could only see a candidate's data after that candidate applied
to one of their jobs. Opt-in, default off; mirrors the auto_apply_opt_in
column shape and the cv_ai_consent seeding pattern from
20260720_0055_seed_legal_documents.py.

Revision ID: 20260723_0069
Revises: 20260723_0068
Create Date: 2026-07-23 00:00:00
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0069"
down_revision: Union[str, None] = "20260723_0068"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONTENT_DIR = Path(__file__).resolve().parents[2] / "app" / "legal_content"
_SLUG = "consentimento-diretorio-candidatos"
_VERSION_LABEL = "2026-07"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {c["name"] for c in inspector.get_columns("candidate_profiles")}
    if "discoverable_opt_in" not in columns:
        op.add_column(
            "candidate_profiles",
            sa.Column("discoverable_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.alter_column("candidate_profiles", "discoverable_opt_in", server_default=None)

    existing = bind.execute(
        sa.text("SELECT 1 FROM legal_documents WHERE slug = :slug"), {"slug": _SLUG}
    ).first()
    if not existing:
        now = datetime.utcnow()
        documents = sa.table(
            "legal_documents",
            sa.column("id", sa.String), sa.column("slug", sa.String), sa.column("title", sa.String),
            sa.column("category", sa.String), sa.column("audience", sa.String),
            sa.column("requires_acceptance", sa.Boolean),
            sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime),
        )
        versions = sa.table(
            "legal_document_versions",
            sa.column("id", sa.String), sa.column("document_id", sa.String),
            sa.column("version_label", sa.String), sa.column("body_markdown", sa.Text),
            sa.column("effective_date", sa.DateTime), sa.column("status", sa.String),
            sa.column("published_at", sa.DateTime),
            sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime),
        )

        body_markdown = (_CONTENT_DIR / f"{_SLUG}.md").read_text(encoding="utf-8")
        document_id = str(uuid.uuid4())
        bind.execute(
            documents.insert().values(
                id=document_id, slug=_SLUG,
                title="Consentimento do Candidato para o Diretório de Candidatos",
                category="candidate_directory_consent", audience="public",
                requires_acceptance=True, created_at=now, updated_at=now,
            )
        )
        bind.execute(
            versions.insert().values(
                id=str(uuid.uuid4()), document_id=document_id, version_label=_VERSION_LABEL,
                body_markdown=body_markdown, effective_date=now, status="published",
                published_at=now, created_at=now, updated_at=now,
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM legal_document_versions WHERE document_id IN "
            "(SELECT id FROM legal_documents WHERE slug = :slug)"
        ),
        {"slug": _SLUG},
    )
    bind.execute(sa.text("DELETE FROM legal_documents WHERE slug = :slug"), {"slug": _SLUG})
    op.drop_column("candidate_profiles", "discoverable_opt_in")
