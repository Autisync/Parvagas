#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RR_DIR="$ROOT_DIR/reactive-resume"

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }
warn() { echo "[WARN] $1"; }

[[ -f "$RR_DIR/package.json" ]] || fail "reactive-resume/package.json not found"
pass "Reactive Resume source detected"

required_env=(
  APP_URL
  DATABASE_URL
  AUTH_SECRET
  CV_BUILDER_DATABASE_URL
  RESUME_BUILDER_SECRET
  CV_BUILDER_ENCRYPTION_SECRET
  PARVAGAS_OAUTH_DISCOVERY_URL
  PARVAGAS_WEBHOOK_SECRET
)

for key in "${required_env[@]}"; do
  [[ -n "${!key:-}" ]] || fail "Required environment variable is missing: $key"
done
pass "Required environment variables are present"

[[ "$APP_URL" =~ ^https?:// ]] || fail "APP_URL must be a valid http/https URL"
[[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]] || fail "DATABASE_URL must be a PostgreSQL URL"
[[ "$CV_BUILDER_DATABASE_URL" =~ ^postgres(ql)?:// ]] || fail "CV_BUILDER_DATABASE_URL must be a PostgreSQL URL"
[[ -n "$AUTH_SECRET" ]] || fail "AUTH_SECRET must not be empty"
pass "Core URL/secret validation passed"

if [[ -n "${REDIS_URL:-}" ]]; then
  [[ "${#CV_BUILDER_ENCRYPTION_SECRET}" -ge 32 ]] || fail "CV_BUILDER_ENCRYPTION_SECRET must be at least 32 chars"
  pass "Encryption secret length is valid for Redis-enabled setup"
fi

pkg_manager="$(node -e "const p=require('$RR_DIR/package.json'); process.stdout.write(String(p.packageManager||''));")"
[[ "$pkg_manager" == pnpm@* ]] || fail "packageManager is not pnpm in reactive-resume/package.json"
current_pnpm="$(pnpm -v 2>/dev/null || true)"
[[ -n "$current_pnpm" ]] || fail "pnpm is not installed"
pass "pnpm available (installed=$current_pnpm, expected=$pkg_manager)"

if command -v curl >/dev/null 2>&1; then
  curl -fsS "${PARVAGAS_OAUTH_DISCOVERY_URL}" >/dev/null || fail "OAuth discovery endpoint is unreachable"
  pass "OAuth discovery endpoint reachable"
fi

cd "$ROOT_DIR"
docker compose config >/dev/null
docker compose -f docker-compose.dev.yml config >/dev/null
docker compose -f docker-compose.prod.yml config >/dev/null
pass "Docker Compose files resolve successfully"

if docker compose ps postgres >/dev/null 2>&1; then
  if docker compose exec -T postgres sh -lc "pg_isready -U \"\${POSTGRES_USER:-parvagas}\" -d postgres" >/dev/null 2>&1; then
    pass "PostgreSQL is reachable"
  else
    warn "PostgreSQL container is not reachable right now"
  fi

  if docker compose exec -T postgres sh -lc "psql -U \"\${POSTGRES_USER:-parvagas}\" -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='parvagas_cv_builder'\" | grep -q 1" >/dev/null 2>&1; then
    pass "parvagas_cv_builder database exists"
  else
    warn "parvagas_cv_builder database not found in running postgres instance"
  fi
fi

if docker compose ps minio >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:9000/minio/health/live" >/dev/null 2>&1; then
    pass "MinIO is reachable"
  else
    warn "MinIO health endpoint is unreachable on localhost:9000"
  fi
fi

echo "CV Builder integration preflight completed."
