"""Create career_posts table, seed curated articles, seed house ads.

The career-tips / blog section is now admin-managed. This migration:

* creates the ``career_posts`` table,
* seeds it with the curated launch articles (from app.content.career_posts) so
  the public site has content immediately, and
* seeds one neutral "house" ad campaign per real placement (homepage_banner,
  job_list, sidebar) so every ad slot renders something out of the box.

All steps are idempotent — re-running skips rows that already exist by slug /
(title, placement).

Revision ID: 20260630_0014
Revises: 20260630_0013
Create Date: 2026-06-30 00:00:00
"""
from typing import Sequence, Union
import json
import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision: str = "20260630_0014"
down_revision: Union[str, None] = "20260630_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


HOUSE_ADS = [
    {
        "title": "Publique a sua vaga na Parvagas",
        "placement": "homepage_banner",
        "link": "https://parvagas.pt/Signup",
    },
    {
        "title": "Crie o seu perfil a partir do CV",
        "placement": "job_list",
        "link": "https://parvagas.pt/Submission",
    },
    {
        "title": "Dicas de carreira para se destacar",
        "placement": "sidebar",
        "link": "https://parvagas.pt/Dicas-de-Carreira",
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "career_posts" not in inspector.get_table_names():
        op.create_table(
            "career_posts",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("slug", sa.String(length=255), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("category", sa.String(length=100), nullable=True),
            sa.Column("excerpt", sa.Text(), nullable=True),
            sa.Column("read_time", sa.String(length=50), nullable=True),
            sa.Column("author", sa.String(length=255), nullable=True),
            sa.Column("cover_image", sa.Text(), nullable=True),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("takeaways", sa.Text(), nullable=True),
            sa.Column("featured_on_home", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("slug", name="uq_career_posts_slug"),
        )
        op.create_index("ix_career_posts_slug", "career_posts", ["slug"])

    _seed_career_posts(bind)
    _seed_house_ads(bind)


def _seed_career_posts(bind) -> None:
    # Imported lazily so the migration does not hard-depend on app import order.
    from app.content.career_posts import CAREER_POSTS

    existing = {row[0] for row in bind.execute(sa.text("SELECT slug FROM career_posts"))}
    now = datetime.utcnow()
    rows = []
    for p in CAREER_POSTS:
        if p["slug"] in existing:
            continue
        published_at = _parse_iso(p.get("published_at")) or now
        rows.append(
            {
                "id": p.get("id") or str(uuid.uuid4()),
                "slug": p["slug"],
                "title": p["title"],
                "category": p.get("category"),
                "excerpt": p.get("excerpt"),
                "read_time": p.get("read_time"),
                "author": p.get("author"),
                "cover_image": p.get("cover_image"),
                "body": json.dumps(p.get("body", []), ensure_ascii=False),
                "takeaways": json.dumps(p.get("takeaways", []), ensure_ascii=False),
                "featured_on_home": bool(p.get("featured_on_home", False)),
                "published": True,
                "published_at": published_at,
                "created_at": now,
                "updated_at": now,
            }
        )
    if rows:
        op.bulk_insert(_career_posts_table(), rows)


def _seed_house_ads(bind) -> None:
    if "ad_campaigns" not in sa.inspect(bind).get_table_names():
        return
    now = datetime.utcnow()
    for ad in HOUSE_ADS:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM ad_campaigns WHERE placement = :p AND title = :t LIMIT 1"
            ),
            {"p": ad["placement"], "t": ad["title"]},
        ).first()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO ad_campaigns "
                "(id, title, placement, link, status, active, flagged, "
                " cost_per_click, cost_per_impression, clicks, impressions, "
                " created_at, updated_at) "
                "VALUES (:id, :title, :placement, :link, 'active', :active, :flagged, "
                " 0, 0, 0, 0, :created_at, :updated_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "title": ad["title"],
                "placement": ad["placement"],
                "link": ad["link"],
                "active": True,
                "flagged": False,
                "created_at": now,
                "updated_at": now,
            },
        )


def _career_posts_table() -> sa.Table:
    meta = sa.MetaData()
    return sa.Table(
        "career_posts",
        meta,
        sa.Column("id", sa.String(36)),
        sa.Column("slug", sa.String(255)),
        sa.Column("title", sa.String(255)),
        sa.Column("category", sa.String(100)),
        sa.Column("excerpt", sa.Text()),
        sa.Column("read_time", sa.String(50)),
        sa.Column("author", sa.String(255)),
        sa.Column("cover_image", sa.Text()),
        sa.Column("body", sa.Text()),
        sa.Column("takeaways", sa.Text()),
        sa.Column("featured_on_home", sa.Boolean()),
        sa.Column("published", sa.Boolean()),
        sa.Column("published_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def downgrade() -> None:
    op.drop_index("ix_career_posts_slug", table_name="career_posts")
    op.drop_table("career_posts")
