"""Structural tests for the Alembic migration chain."""
import os

from alembic.config import Config
from alembic.script import ScriptDirectory

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _script_dir() -> ScriptDirectory:
    cfg = Config(os.path.join(_HERE, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_HERE, "migrations"))
    return ScriptDirectory.from_config(cfg)


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
