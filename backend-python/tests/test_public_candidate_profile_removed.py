"""Regression test for overnight-audit W5.2 — confirms the old
GET /public/candidates/{user_id} route (unauthenticated, unfiltered
candidate profile lookup, zero frontend callers) is gone at the router
level, not just re-gated. It was replaced by
GET /companies/candidates/{user_id} in app.api.v1.candidate_search, which
requires company auth, the Business-plan gate, and discoverable_opt_in.
"""
from app.api.v1.router import router


def test_old_public_candidate_route_no_longer_registered():
    paths = {route.path for route in router.routes}
    assert "/api/v1/public/candidates/{user_id}" not in paths
    assert any(p.endswith("/companies/candidates/{user_id}") for p in paths)
