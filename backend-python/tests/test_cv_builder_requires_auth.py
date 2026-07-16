"""The CV builder is account-holders-only.

The guest "Criar CV do Zero" entry point (POST /public/resume-sso/guest-start,
formerly app/api/v1/resume_sso.py) created a shadow account from just a name
+ email and logged the visitor straight into the builder with no signup. That
flow was removed by product decision — building a CV now requires a real
authenticated account, same as every other /resumes route. These tests pin
that down so the public endpoint can't quietly come back.
"""
from fastapi.routing import APIRoute

from app.main import app


def _route_paths() -> set[str]:
    return {r.path for r in app.routes if isinstance(r, APIRoute)}


def test_guest_start_route_is_gone():
    assert "/api/v1/public/resume-sso/guest-start" not in _route_paths()
    assert not any("resume-sso" in p for p in _route_paths())


def test_resume_routes_all_require_authentication():
    """Every /resumes route must resolve the current user — none may be
    reachable anonymously. get_current_user (or a wrapper of it) appearing in
    the dependency tree is what enforces 401 for missing/invalid tokens."""
    # Deliberately public: the template catalog is read-only display data
    # (names of active CV templates), with no user content behind it.
    public_allowlist = {"/api/v1/resumes/templates"}

    resume_routes = [
        r for r in app.routes
        if isinstance(r, APIRoute)
        and r.path.startswith("/api/v1/resumes")
        and r.path not in public_allowlist
    ]
    assert resume_routes, "expected /resumes routes to exist"
    for route in resume_routes:
        dep_names = {
            getattr(d.call, "__name__", "") for d in route.dependant.dependencies
        } | {
            getattr(p.depends.dependency, "__name__", "")
            for p in route.dependant.query_params + route.dependant.header_params
            if getattr(p, "depends", None) and p.depends and p.depends.dependency
        }
        # FastAPI nests dependencies; flatten one level for wrappers.
        flat = set(dep_names)
        for d in route.dependant.dependencies:
            for sub in d.dependencies:
                flat.add(getattr(sub.call, "__name__", ""))
        assert any("current_user" in name for name in flat), (
            f"{route.methods} {route.path} does not require an authenticated user"
        )
