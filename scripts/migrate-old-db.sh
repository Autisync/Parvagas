#!/bin/sh
set -eu

require_var() {
  var_name="$1"
  var_value="$(printenv "$var_name" || true)"

  if [ -z "$var_value" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

if [ -z "$(printenv OLD_DATABASE_URL || true)" ]; then
  require_var "DATABASE_URL"
  OLD_DATABASE_URL="$(printenv DATABASE_URL)"
  echo "OLD_DATABASE_URL not set, using DATABASE_URL as source."
else
  OLD_DATABASE_URL="$(printenv OLD_DATABASE_URL)"
fi

if [ -z "$(printenv NEW_DATABASE_URL || true)" ]; then
  require_var "POSTGRES_USER"
  require_var "POSTGRES_PASSWORD"
  require_var "POSTGRES_DB"
  NEW_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
else
  NEW_DATABASE_URL="$(printenv NEW_DATABASE_URL)"
fi

if [ "$OLD_DATABASE_URL" = "$NEW_DATABASE_URL" ]; then
  if [ "$(printenv ALLOW_IN_PLACE_COPY || true)" != "true" ]; then
    echo "Source and target database URLs are the same. Set OLD_DATABASE_URL to the old database." >&2
    echo "If you really want in-place restore, set ALLOW_IN_PLACE_COPY=true." >&2
    exit 1
  fi

  echo "Source and target database URLs are the same. Running backup/restore in-place because ALLOW_IN_PLACE_COPY=true."
fi

TMP_DUMP_PATH="/tmp/parvagas-old-db.dump"
MISMATCH_COUNT=0

cleanup() {
  rm -f "$TMP_DUMP_PATH"
}

trap cleanup EXIT

echo "Starting full database copy from OLD_DATABASE_URL to NEW_DATABASE_URL..."

# Includes schema and data to guarantee a full transfer.
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --dbname="$OLD_DATABASE_URL" \
  --file="$TMP_DUMP_PATH"

echo "Database dump created. Restoring into target database..."

# --clean and --if-exists ensure old objects in target DB are replaced.
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$NEW_DATABASE_URL" \
  "$TMP_DUMP_PATH"

echo "Restore completed. Validating row counts for all public tables..."

TABLES="$(psql "$OLD_DATABASE_URL" -Atc "
  SELECT quote_ident(table_schema) || '.' || quote_ident(table_name)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY 1
")"

if [ -z "$TABLES" ]; then
  echo "No public tables found in source database. Nothing to validate."
  exit 0
fi

for table_name in $TABLES; do
  old_count="$(psql "$OLD_DATABASE_URL" -Atc "SELECT count(*) FROM $table_name")"
  new_count="$(psql "$NEW_DATABASE_URL" -Atc "SELECT count(*) FROM $table_name")"

  if [ "$old_count" != "$new_count" ]; then
    echo "Mismatch in $table_name: source=$old_count target=$new_count" >&2
    MISMATCH_COUNT=$((MISMATCH_COUNT + 1))
  else
    echo "OK $table_name: $new_count rows"
  fi
done

if [ "$MISMATCH_COUNT" -gt 0 ]; then
  echo "Data copy finished with $MISMATCH_COUNT mismatched table(s)." >&2
  exit 1
fi

echo "Data copy and validation completed successfully."
