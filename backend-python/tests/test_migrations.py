"""Structural tests for the Alembic migration chain."""
import importlib.util
import os

from alembic import op as _op_proxy
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _script_dir() -> ScriptDirectory:
    cfg = Config(os.path.join(_HERE, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_HERE, "migrations"))
    return ScriptDirectory.from_config(cfg)


def _load_migration_module(filename: str):
    """Import a single migration file in isolation (not via the full
    `alembic upgrade head` chain — several unrelated migrations use
    ALTER-constraint operations SQLite can't run outside batch mode, so the
    full chain isn't executable against SQLite at all). Good enough to unit
    test one migration's upgrade() logic against a hand-built schema."""
    path = os.path.join(_HERE, "migrations", "versions", filename)
    spec = importlib.util.spec_from_file_location(filename, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_single_head():
    """A divergent chain (multiple heads) breaks `alembic upgrade head`."""
    heads = _script_dir().get_heads()
    assert len(heads) == 1, f"Expected exactly one head, found: {heads}"


def test_single_base_is_initial_schema():
    """The chain must root at the initial-schema migration, not the seed."""
    script = _script_dir()
    bases = list(script.get_bases())
    assert bases == ["20260516_0000"], f"Unexpected base(s): {bases}"


def test_initial_migration_creates_users_table():
    """Guard against regressing to create_all-only schema management."""
    path = os.path.join(_HERE, "migrations", "versions", "20260516_0000_initial_schema.py")
    with open(path) as fh:
        source = fh.read()
    assert 'create_table(\n            "users"' in source or '"users"' in source


# ── Regression: a seed migration must set every NOT NULL column ──────────
# 20260718_0051 originally omitted created_at/updated_at from its raw Core
# insert into feature_flags — those columns are nullable=False with only a
# Python-side ORM default (TimestampMixin), no DB server_default, so the
# migration crashed with a Postgres NotNullViolation and the app crash-
# looped on every boot (the app never gets to serve a request until
# `alembic upgrade head` finishes). None of this is exercised by the rest
# of the suite, which builds test schemas via Base.metadata.create_all()
# and never runs Alembic migrations at all.

def test_seed_scraper_auto_approve_flag_sets_required_timestamps():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE feature_flags (
                key VARCHAR(80) PRIMARY KEY,
                value BOOLEAN NOT NULL,
                description TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        ctx = MigrationContext.configure(conn)
        _op_proxy._proxy = Operations(ctx)

        migration = _load_migration_module("20260718_0051_seed_scraper_auto_approve_flag.py")
        migration.upgrade()

        rows = conn.exec_driver_sql(
            "SELECT key, created_at, updated_at FROM feature_flags"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "SCRAPER_AUTO_APPROVE_ENABLED"
        assert rows[0][1] is not None
        assert rows[0][2] is not None

        # Re-running upgrade() (e.g. a retried deploy) must not duplicate the row.
        migration.upgrade()
        count = conn.exec_driver_sql("SELECT count(*) FROM feature_flags").fetchone()[0]
        assert count == 1


# ── Regression: legal-document seed reads real content and is idempotent ──

def test_seed_legal_documents_creates_all_14_published():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE users (
                id VARCHAR(36) PRIMARY KEY
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE legal_documents (
                id VARCHAR(36) PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                title VARCHAR(200) NOT NULL,
                category VARCHAR(40) NOT NULL,
                audience VARCHAR(20) NOT NULL,
                requires_acceptance BOOLEAN NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE legal_document_versions (
                id VARCHAR(36) PRIMARY KEY,
                document_id VARCHAR(36) NOT NULL,
                version_label VARCHAR(40) NOT NULL,
                body_markdown TEXT NOT NULL,
                effective_date DATETIME,
                status VARCHAR(20) NOT NULL,
                published_at DATETIME,
                published_by_user_id VARCHAR(36),
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        ctx = MigrationContext.configure(conn)
        _op_proxy._proxy = Operations(ctx)

        migration = _load_migration_module("20260720_0055_seed_legal_documents.py")
        migration.upgrade()

        docs = conn.exec_driver_sql("SELECT slug, requires_acceptance FROM legal_documents").fetchall()
        assert len(docs) == 14
        slugs = {row[0] for row in docs}
        assert slugs == {
            "privacidade", "termos", "termos-empregador", "cookies", "politica-retencao",
            "consentimento-cv-ia", "reembolsos", "utilizacao-aceitavel", "msa", "dpa",
            "seguranca-incidentes", "acesso-administrativo", "modelo-resposta-disputa",
            "fluxo-resolucao-disputas",
        }

        # Every document has exactly one published version with real, non-empty content.
        versions = conn.exec_driver_sql(
            "SELECT document_id, status, body_markdown FROM legal_document_versions"
        ).fetchall()
        assert len(versions) == 14
        for _, status, body in versions:
            assert status == "published"
            assert len(body) > 200  # not a placeholder/empty stub

        # Re-running upgrade() must not duplicate rows (idempotent seed).
        migration.upgrade()
        count = conn.exec_driver_sql("SELECT count(*) FROM legal_documents").fetchone()[0]
        assert count == 14
