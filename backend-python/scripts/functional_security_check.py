"""Functional/live check for the security-monitoring + HIBP features.

Runs the real FastAPI app in-process (TestClient -> real ASGI/HTTP layer,
unlike the unit tests which call endpoint functions directly) against an
isolated SQLite file DB. Exercises:

  1. Register a user, then hit /api/v1/auth/login with the wrong password
     SECURITY_FAILED_LOGIN_BURST_THRESHOLD times -> burst detection fires.
  2. GET /api/v1/admin/security/events as an admin confirms the failed_login
     events (and the login_burst/alert_sent event) are visible, filterable,
     and counted in the 24h summary.
  3. Pwned-password rejection at registration when HIBP_PASSWORD_CHECK_ENABLED
     is on (using a monkeypatched hibp_service so no real network call is
     made — this is a local functional check, not a live call to HIBP).

No real email is sent (SMTP_HOST unset in this env) and no real HIBP network
call is made. Prints PASS/FAIL per step and exits nonzero on any failure.
"""
import os
import sys
import tempfile

os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET"] = "functional-check-secret-key-1234567890"
_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite3")
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_db_path}"
os.environ["ADMIN_SIGNUP_KEY"] = "functional-check-admin-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["SECURITY_FAILED_LOGIN_BURST_THRESHOLD"] = "3"
os.environ["SECURITY_FAILED_LOGIN_BURST_WINDOW_MINUTES"] = "10"
# No real Redis/broker in this environment — run Celery tasks (verification
# emails etc. queued by register/login) synchronously in-process instead.
os.environ["CELERY_BROKER_URL"] = "memory://"
os.environ["CELERY_RESULT_BACKEND"] = "cache+memory://"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

failures = []


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


def main():
    from fastapi.testclient import TestClient

    from app.core.observability import limiter
    limiter.enabled = False

    from app.db.base import Base
    from app.db.session import engine
    import app.models  # noqa: F401 ensure all models are registered before create_all
    Base.metadata.create_all(bind=engine)

    from app.main import app
    client = TestClient(app)

    # --- 1. Register candidate + admin -------------------------------------
    cand_email = "functional-check-candidate@example.com"
    r = client.post("/api/v1/auth/register", json={
        "email": cand_email,
        "password": "SomeStrongPassw0rd!",
        "fullName": "Functional Check",
        "role": "candidate",
    })
    check("register candidate -> 2xx", r.status_code < 300)

    # The register endpoint only accepts role=candidate|company (no
    # self-serve admin signup) — create the admin row directly, then log in
    # through the real HTTP endpoint like any admin would.
    from app.core.security import hash_password
    from app.db.session import SessionLocal
    from app.models import User, UserRole, AdminLevel

    admin_email = "functional-check-admin@example.com"
    db = SessionLocal()
    db.add(User(
        email=admin_email,
        full_name="Functional Admin",
        password_hash=hash_password("AdminStrongPassw0rd!"),
        role=UserRole.admin,
        admin_level=AdminLevel.super_admin.value,
        email_verified=True,
    ))
    db.commit()
    db.close()

    r2 = client.post("/api/v1/auth/login", json={"email": admin_email, "password": "AdminStrongPassw0rd!"})
    check("admin login -> 2xx", r2.status_code < 300)
    admin_token = r2.json().get("accessToken") or r2.json().get("access_token")
    check("obtained admin token", bool(admin_token))

    # --- 2. Trigger a failed-login burst on the candidate account ----------
    threshold = int(os.environ["SECURITY_FAILED_LOGIN_BURST_THRESHOLD"])
    for i in range(threshold):
        r = client.post("/api/v1/auth/login", json={"email": cand_email, "password": "wrong-password"})
        check(f"failed login attempt {i+1}/{threshold} -> 401", r.status_code == 401)

    # --- 3. Admin can see the events via the real HTTP endpoint ------------
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.get("/api/v1/admin/security/events", headers=headers, params={"eventType": "failed_login"})
    check("GET /admin/security/events (failed_login) -> 200", r.status_code == 200)
    body = r.json() if r.status_code == 200 else {}
    events = body.get("securityEvents", [])
    check(f"failed_login events recorded (found {len(events)}, want >= {threshold})", len(events) >= threshold)
    if events:
        check("event has ip/email fields", "email" in events[0] and "ipAddress" in events[0])

    r_burst = client.get("/api/v1/admin/security/events", headers=headers, params={"eventType": "login_burst"})
    burst_events = r_burst.json().get("securityEvents", []) if r_burst.status_code == 200 else []
    check("login_burst event recorded once threshold hit", len(burst_events) >= 1)

    r_summary = client.get("/api/v1/admin/security/events", headers=headers)
    summary = r_summary.json().get("summary", {}) if r_summary.status_code == 200 else {}
    check("24h summary reflects failed logins", summary.get("last24hFailedLogins", 0) >= threshold)

    # Non-admin is rejected
    r_cand_token = client.post("/api/v1/auth/login", json={"email": cand_email, "password": "SomeStrongPassw0rd!"})
    cand_token = r_cand_token.json().get("accessToken") or r_cand_token.json().get("access_token")
    r_forbidden = client.get("/api/v1/admin/security/events", headers={"Authorization": f"Bearer {cand_token}"})
    check("non-admin denied /admin/security/events", r_forbidden.status_code in (401, 403))

    # --- 4. Pwned-password rejection (local, no real HIBP network call) ----
    from app.core.config import get_settings
    get_settings.cache_clear()
    os.environ["HIBP_PASSWORD_CHECK_ENABLED"] = "true"
    get_settings.cache_clear()

    import app.services.hibp_service as hibp_service
    original = hibp_service.password_is_pwned
    hibp_service.password_is_pwned = lambda password: True
    try:
        r = client.post("/api/v1/auth/register", json={
            "email": "functional-check-pwned@example.com",
            "password": "password123",
            "fullName": "Pwned Check",
            "role": "candidate",
        })
        check("registration rejects pwned password (422)", r.status_code == 422)
    finally:
        hibp_service.password_is_pwned = original
        os.environ["HIBP_PASSWORD_CHECK_ENABLED"] = "false"
        get_settings.cache_clear()

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print(f"All checks passed.")


if __name__ == "__main__":
    try:
        main()
    finally:
        try:
            os.close(_db_fd)
            os.remove(_db_path)
        except OSError:
            pass
