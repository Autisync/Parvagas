"""Seed the "executivo" resume template + un-placeholder "moderno" (Phase B2).

EXECUTION_PLAN_NATIVE_CV_BUILDER.md B2: both slugs now have real Jinja2+CSS
implementations in app/services/resume_render_service.py (TEMPLATES), so
"moderno"'s A1-era "disponível na próxima fase" description is stale and
"executivo" gets its row. preview_url stays NULL for all three — the picker
UI renders its own CSS thumbnail cards instead of loading image files (no
asset pipeline needed, thumbnails can never drift from the real templates).

Revision ID: 20260712_0029
Revises: 20260712_0028
Create Date: 2026-07-12 17:00:00
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260712_0029"
down_revision: Union[str, None] = "20260712_0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EXECUTIVO = {
    "name": "Executivo",
    "slug": "executivo",
    "description": "Duas colunas com barra lateral escura — contacto e competências em destaque.",
}

_MODERNO_NEW_DESC = "Coluna única com destaque a vermelho — visual contemporâneo."
_MODERNO_OLD_DESC = "Visual mais contemporâneo (disponível na próxima fase)."


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    templates = sa.Table("resume_templates", metadata, autoload_with=bind)
    now = sa.func.now()

    existing = {row[0] for row in bind.execute(sa.select(templates.c.slug))}
    if _EXECUTIVO["slug"] not in existing:
        bind.execute(templates.insert().values(
            id=str(uuid.uuid4()),
            name=_EXECUTIVO["name"],
            slug=_EXECUTIVO["slug"],
            description=_EXECUTIVO["description"],
            preview_url=None,
            schema=None,
            is_active=True,
            created_at=now,
            updated_at=now,
        ))

    bind.execute(
        templates.update()
        .where(templates.c.slug == "moderno")
        .values(description=_MODERNO_NEW_DESC, updated_at=now)
    )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    templates = sa.Table("resume_templates", metadata, autoload_with=bind)
    bind.execute(templates.delete().where(templates.c.slug == _EXECUTIVO["slug"]))
    bind.execute(
        templates.update()
        .where(templates.c.slug == "moderno")
        .values(description=_MODERNO_OLD_DESC)
    )
