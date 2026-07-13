#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required=(
  "docker-compose.yml"
  "docker-compose.dev.yml"
  "docker-compose.dev.portainer.yml"
  "docker-compose.prod.portainer.yml"
  "reactive-resume/Dockerfile"
)

for f in "${required[@]}"; do
  [[ -f "$f" ]] || { echo "[FAIL] Missing required file: $f"; exit 1; }
done

for retired in docker-compose-updated.yml docker-compose.prod.yml docker-compose.portainer.yml; do
  if [[ -f "$retired" ]]; then
    echo "[FAIL] Retired compose file still present at repo root: $retired"
    exit 1
  fi
done

if [[ -z "${TRAEFIK_NETWORK:-}" ]]; then
  echo "[WARN] TRAEFIK_NETWORK is not set; default 'proxy' will be used in Portainer files."
fi

echo "[CHECK] docker-compose.yml"
docker compose -f docker-compose.yml config >/tmp/compose-base.out

echo "[CHECK] docker-compose.yml + docker-compose.dev.yml"
docker compose -f docker-compose.yml -f docker-compose.dev.yml config >/tmp/compose-local.out

echo "[CHECK] docker-compose.dev.portainer.yml"
docker compose --env-file .env.dev.portainer.example -f docker-compose.dev.portainer.yml config >/tmp/compose-dev-portainer.out

echo "[CHECK] docker-compose.prod.portainer.yml"
docker compose --env-file .env.prod.portainer.example -f docker-compose.prod.portainer.yml config >/tmp/compose-prod-portainer.out

# Detect duplicate published host ports across active files.
ports="$(grep -hE 'published: "?[0-9]+' /tmp/compose-*.out | sed -E 's/.*published: "?([0-9]+)"?/\1/' || true)"
if [[ -n "$ports" ]]; then
  dups="$(echo "$ports" | sort | uniq -d)"
  if [[ -n "$dups" ]]; then
    echo "[FAIL] Duplicate exposed host ports detected: $dups"
    exit 1
  fi
fi

# Detect duplicate traefik router names between dev/prod Portainer files.
rdev="$(grep -oE 'traefik\.http\.routers\.[^.]+\.' docker-compose.dev.portainer.yml | sed 's/.$//' | sort -u || true)"
rprod="$(grep -oE 'traefik\.http\.routers\.[^.]+\.' docker-compose.prod.portainer.yml | sed 's/.$//' | sort -u || true)"
if [[ -n "$rdev" && -n "$rprod" ]]; then
  overlap="$(comm -12 <(echo "$rdev") <(echo "$rprod") || true)"
  if [[ -n "$overlap" ]]; then
    echo "[FAIL] Duplicate Traefik router names found in dev/prod:"
    echo "$overlap"
    exit 1
  fi
fi

# Obsolete CV variables must not appear in active compose files.
scan_files=(
  "docker-compose.yml"
  "docker-compose.dev.yml"
  "docker-compose.dev.portainer.yml"
  "docker-compose.prod.portainer.yml"
  ".env.example"
  ".env.local.example"
  ".env.dev.portainer.example"
  ".env.prod.portainer.example"
)

if grep -En 'STORAGE_PROVIDER|STORAGE_ENDPOINT|ACCESS_TOKEN_SECRET|REFRESH_TOKEN_SECRET|BETTER_AUTH_SECRET|NEXT_PUBLIC_CV_BUILDER_URL' "${scan_files[@]}"; then
  echo "[FAIL] Obsolete CV/storage/auth variables detected."
  exit 1
fi

# Check service_healthy dependency targets have healthcheck (heuristic per file).
for f in docker-compose.yml docker-compose.dev.portainer.yml docker-compose.prod.portainer.yml; do
  while IFS= read -r svc; do
    if ! awk -v s="$svc" 'found && /^  [a-zA-Z0-9_-]+:/{exit} found && /healthcheck:/{ok=1} $0 ~ "^  " s ":"{found=1} END{exit ok?0:1}' "$f"; then
      echo "[FAIL] $f depends_on condition=service_healthy for service '$svc' but no healthcheck found."
      exit 1
    fi
  done < <(awk '/depends_on:/{in_dep=1;next} in_dep && /condition: service_healthy/{print prev} in_dep && /^  [a-zA-Z0-9_-]+:/{in_dep=0} {if (in_dep && /^      [a-zA-Z0-9_-]+:/){gsub(":","",$1); prev=$1}}' "$f" | sort -u)
done

# Dev/prod isolation checks.
if grep -q 'parvagas_dev_postgres_data' docker-compose.prod.portainer.yml; then
  echo "[FAIL] Prod stack references dev volumes."
  exit 1
fi
if grep -q 'parvagas_prod_postgres_data' docker-compose.dev.portainer.yml; then
  echo "[FAIL] Dev stack references prod volumes."
  exit 1
fi
if grep -q 'parvagas_cv_builder_dev' docker-compose.prod.portainer.yml; then
  echo "[FAIL] Prod stack references dev DB name."
  exit 1
fi
if grep -q 'reactive-resume-dev' docker-compose.prod.portainer.yml; then
  echo "[FAIL] Prod stack references dev bucket."
  exit 1
fi
if grep -q 'CV_BUILDER_S3_BUCKET:-reactive-resume}' docker-compose.dev.portainer.yml; then
  echo "[FAIL] Dev stack references prod bucket name."
  exit 1
fi

# Detect nested interpolation patterns that Portainer may not resolve.
if grep -En '\$\{[^}]*\$\{' "${scan_files[@]}"; then
  echo "[FAIL] Nested variable interpolation detected."
  exit 1
fi

echo "[PASS] Compose validations completed."
