"""Seed the 2 resume templates for the native CV builder MVP (Phase A).

EXECUTION_PLAN_NATIVE_CV_BUILDER.md A1. "moderno" is a placeholder until
Phase B's WeasyPrint templates exist — both currently render through the
same reportlab ATS layout in cv_export_service (template selection has no
visual effect yet; the row exists so the picker UI has two real options to
build against).

Revision ID: 20260712_0028
Revises: 20260712_0027
Create Date: 2026-07-12 01:00:00
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260712_0028"
down_revision: Union[str, None] = "20260712_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TEMPLATES = [
    {
        "name": "ATS Clássico",
        "slug": "ats-classic",
        "description": "Layout de coluna única otimizado para leitura por sistemas ATS.",
    },
    {
        "name": "Moderno",
        "slug": "moderno",
        "description": "Visual mais contemporâneo (disponível na próxima fase).",
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    templates = sa.Table("resume_templates", metadata, autoload_with=bind)

    existing = {row[0] for row in bind.execute(sa.select(templates.c.slug))}
    now = sa.func.now()
    for tpl in _TEMPLATES:
        if tpl["slug"] in existing:
            continue
        bind.execute(templates.insert().values(
            id=str(uuid.uuid4()),
            name=tpl["name"],
            slug=tpl["slug"],
            description=tpl["description"],
            preview_url=None,
            schema=None,
            is_active=True,
            created_at=now,
            updated_at=now,
        ))


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    templates = sa.Table("resume_templates", metadata, autoload_with=bind)
    bind.execute(templates.delete().where(
        templates.c.slug.in_([t["slug"] for t in _TEMPLATES])
    ))
