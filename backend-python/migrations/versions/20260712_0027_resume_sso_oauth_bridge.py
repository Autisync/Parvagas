"""Add sso_handoff_codes and oauth_authorization_codes (CV builder SSO bridge).

Parvagas acts as an OIDC provider for the self-hosted Reactive Resume
instance so a logged-in candidate lands there already authenticated. See
app.api.v1.resume_sso for the endpoints and app.models.SSOHandoffCode /
OAuthAuthorizationCode docstrings for why two short-lived code tables are
needed instead of one (bearer-token frontend -> browser redirect -> proper
OIDC code exchange).

Revision ID: 20260712_0027
Revises: 20260712_0026
Create Date: 2026-07-12 00:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260712_0027"
down_revision: Union[str, None] = "20260712_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "sso_handoff_codes" not in existing:
        op.create_table(
            "sso_handoff_codes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("code", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "oauth_authorization_codes" not in existing:
        op.create_table(
            "oauth_authorization_codes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("code", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("client_id", sa.String(100), nullable=False),
            sa.Column("redirect_uri", sa.String(500), nullable=False),
            sa.Column("scope", sa.String(255), nullable=True),
            sa.Column("nonce", sa.String(255), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("oauth_authorization_codes")
    op.drop_table("sso_handoff_codes")
