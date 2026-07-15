"""Proves the CV-builder AI endpoints' per-user rate-limit key actually
works end-to-end — not just in isolation.

slowapi's key_func only ever receives the raw Request (see
Limiter.__evaluate_limits in slowapi/extension.py); it has no access to
FastAPI-resolved dependencies like `current_user`. rate_limit_key_by_user
instead reads request.state.auth_claims, which is set by
attach_auth_context — a real ASGI `@app.middleware("http")` in main.py that
runs before routing/dependency resolution on every request. These tests
wire the REAL middleware function to the REAL key_func in a minimal test
app (no DB/Redis needed — this only tests the middleware -> key_func
handoff, not the rate-limit counting itself, which is slowapi's own,
unchanged, already-relied-upon logic) and prove the actual claim: two
different authenticated users hitting the same TestClient (i.e. the same
"IP" from the server's point of view) get different rate-limit keys.
"""
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.core.observability import rate_limit_key_by_user
from app.core.security import create_access_token
from app.main import attach_auth_context


async def _echo_key(request):
    return JSONResponse({"key": rate_limit_key_by_user(request)})


def _build_test_app() -> Starlette:
    app = Starlette(routes=[Route("/echo", _echo_key)])
    app.add_middleware(BaseHTTPMiddleware, dispatch=attach_auth_context)
    return app


def test_rate_limit_key_uses_authenticated_user_id():
    client = TestClient(_build_test_app())
    token = create_access_token({"sub": "user-123", "role": "candidate"})
    resp = client.get("/echo", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["key"] == "user:user-123"


def test_rate_limit_key_falls_back_to_ip_when_unauthenticated():
    client = TestClient(_build_test_app())
    resp = client.get("/echo")
    key = resp.json()["key"]
    assert not key.startswith("user:")


def test_rate_limit_key_falls_back_to_ip_on_invalid_token():
    client = TestClient(_build_test_app())
    resp = client.get("/echo", headers={"Authorization": "Bearer not-a-real-token"})
    key = resp.json()["key"]
    assert not key.startswith("user:")


def test_different_users_get_different_keys_from_the_same_client():
    """The actual bug being fixed: unrelated candidates behind one shared
    IP (common under Angola's carrier-grade mobile NAT) must not throttle
    each other on the AI tools."""
    client = TestClient(_build_test_app())  # one client => one "IP" for both calls
    token_a = create_access_token({"sub": "user-a"})
    token_b = create_access_token({"sub": "user-b"})

    key_a = client.get("/echo", headers={"Authorization": f"Bearer {token_a}"}).json()["key"]
    key_b = client.get("/echo", headers={"Authorization": f"Bearer {token_b}"}).json()["key"]

    assert key_a == "user:user-a"
    assert key_b == "user:user-b"
    assert key_a != key_b


def test_ai_endpoints_use_the_per_user_key_func():
    """Guards against a future edit silently dropping key_func= from one of
    the AI endpoints and reverting it to shared-IP limiting. slowapi stores
    each route's Limit objects (each carrying the key_func it was given) in
    Limiter._route_limits, keyed by "<module>.<function name>"."""
    from app.core.observability import limiter, rate_limit_key_by_user

    for func_name in ["score_resume", "rewrite_resume", "improve_experience", "adapt_resume_to_job"]:
        route_key = f"app.api.v1.resumes.{func_name}"
        limits = limiter._route_limits.get(route_key)
        assert limits, f"no rate limit registered for {func_name}"
        assert all(lim.key_func is rate_limit_key_by_user for lim in limits), (
            f"{func_name} is not keyed by rate_limit_key_by_user"
        )
