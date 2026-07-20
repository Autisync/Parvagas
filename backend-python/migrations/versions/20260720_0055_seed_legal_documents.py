"""Seed all 14 legal documents at their initial published version.

Content lives in app/legal_content/<slug>.md (plain Markdown, not embedded
here) so it can be authored/reviewed as normal files — see
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md Wave L. This migration is idempotent:
re-running it (e.g. a retried deploy) skips any slug that already has a
row, so it never duplicates or overwrites an admin's subsequent edits.

created_at/updated_at are set explicitly on every insert — see
20260718_0051's docstring in this same directory for why a raw Core
insert that omits them crash-loops the app on Postgres.

Revision ID: 20260720_0055
Revises: 20260720_0054
Create Date: 2026-07-20 00:00:00
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260720_0055"
down_revision: Union[str, None] = "20260720_0054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# migrations/versions/<this file>.py -> backend-python/app/legal_content/
_CONTENT_DIR = Path(__file__).resolve().parents[2] / "app" / "legal_content"

_VERSION_LABEL = "2026-07"

# (slug, title, category, audience, requires_acceptance)
_DOCUMENTS = [
    ("privacidade", "Política de Privacidade", "privacy", "public", True),
    ("termos", "Termos e Condições de Utilização", "tos", "public", True),
    ("termos-empregador", "Termos e Condições para Empresas Empregadoras", "employer_tos", "employer", True),
    ("cookies", "Política de Cookies", "cookies", "public", True),
    ("politica-retencao", "Política de Retenção de Dados", "retention", "public", False),
    ("consentimento-cv-ia", "Consentimento do Candidato para Tratamento de CV e Processamento por IA", "cv_ai_consent", "public", True),
    ("reembolsos", "Política de Reembolsos e Cancelamento", "refund", "public", True),
    ("utilizacao-aceitavel", "Política de Utilização Aceitável", "aup", "public", False),
    ("msa", "Acordo de Prestação de Serviços (MSA)", "msa", "employer", True),
    ("dpa", "Acordo de Processamento de Dados (DPA)", "dpa", "employer", True),
    ("seguranca-incidentes", "Política de Segurança e Notificação de Incidentes", "security_policy", "internal", False),
    ("acesso-administrativo", "Política de Acesso e Operações Administrativas", "admin_policy", "internal", True),
    ("modelo-resposta-disputa", "Modelo de Resposta a Disputas de Pagamento", "dispute_template", "internal", False),
    ("fluxo-resolucao-disputas", "Fluxo de Resolução de Disputas de Pagamento", "dispute_workflow", "internal", False),
]


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.utcnow()

    documents = sa.table(
        "legal_documents",
        sa.column("id", sa.String),
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("category", sa.String),
        sa.column("audience", sa.String),
        sa.column("requires_acceptance", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    versions = sa.table(
        "legal_document_versions",
        sa.column("id", sa.String),
        sa.column("document_id", sa.String),
        sa.column("version_label", sa.String),
        sa.column("body_markdown", sa.Text),
        sa.column("effective_date", sa.DateTime),
        sa.column("status", sa.String),
        sa.column("published_at", sa.DateTime),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    for slug, title, category, audience, requires_acceptance in _DOCUMENTS:
        existing = bind.execute(
            sa.text("SELECT 1 FROM legal_documents WHERE slug = :slug"), {"slug": slug}
        ).first()
        if existing:
            continue

        content_path = _CONTENT_DIR / f"{slug}.md"
        body_markdown = content_path.read_text(encoding="utf-8")

        document_id = str(uuid.uuid4())
        bind.execute(
            documents.insert().values(
                id=document_id, slug=slug, title=title, category=category, audience=audience,
                requires_acceptance=requires_acceptance, created_at=now, updated_at=now,
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
    slugs = [d[0] for d in _DOCUMENTS]
    placeholders = ", ".join(f":slug{i}" for i in range(len(slugs)))
    params = {f"slug{i}": slug for i, slug in enumerate(slugs)}
    bind.execute(
        sa.text(
            f"DELETE FROM legal_document_versions WHERE document_id IN "
            f"(SELECT id FROM legal_documents WHERE slug IN ({placeholders}))"
        ),
        params,
    )
    bind.execute(sa.text(f"DELETE FROM legal_documents WHERE slug IN ({placeholders})"), params)
