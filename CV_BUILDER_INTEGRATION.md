# CV Builder Integration (Parvagas + Reactive Resume 5.1.8)

## Architecture

- Source: `reactive-resume/` (Reactive Resume 5.1.8, pnpm 11, Turbo, Hono, Vite, Better Auth).
- Runtime: `cv-builder` container on internal port `3000`.
- Public URL: `RESUME_BUILDER_URL` (default `https://cv.parvagas.pt`).
- Data stores:
  - PostgreSQL database `parvagas_cv_builder` (isolated from main `parvagas` DB).
  - MinIO bucket `reactive-resume` for S3-compatible object storage.
  - Redis for AI workspace and encrypted provider settings.

## Authentication and OAuth

- CV Builder uses Better Auth with custom OAuth provider:
  - `OAUTH_PROVIDER_NAME`
  - `OAUTH_CLIENT_ID`
  - `OAUTH_CLIENT_SECRET`
  - `OAUTH_DISCOVERY_URL`
  - `OAUTH_SCOPES=openid profile email`
- Production defaults:
  - `FLAG_DISABLE_SIGNUPS=true`
  - `FLAG_DISABLE_EMAIL_AUTH=true`

## Synchronisation

- CV Builder -> Parvagas sync env:
  - `PARVAGAS_RESUME_SYNC_ENABLED`
  - `PARVAGAS_API_URL`
  - `PARVAGAS_API_KEY`
  - `PARVAGAS_RESUME_SYNC_PATH`
  - `PARVAGAS_WEBHOOK_SECRET`
- Current implementation sends CV lifecycle events and supports server-to-server auth.

## Database Isolation

- Dedicated DB: `parvagas_cv_builder`.
- One-shot init service: `cv-builder-db-init`.
- One-shot migration service: `cv-builder-migrate` (`pnpm db:migrate`).
- `cv-builder` startup depends on successful DB init and migrations.

## MinIO

- Uses S3 variables expected by Reactive Resume:
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_REGION`
  - `S3_ENDPOINT`
  - `S3_BUCKET`
  - `S3_FORCE_PATH_STYLE`
- Bucket bootstrap service: `cv-builder-bucket-init`.

## Branding and Attribution

- Product branding: Parvagas CV Builder.
- Footer attribution includes:
  - Autisync technology partner statement.
  - MIT attribution to Reactive Resume and license link.
- Sponsor promotions are disabled with `FLAG_SHOW_SPONSORS=false`.

## Deployment Preflight

- Linux/macOS: `./scripts/check-cv-builder-integration.sh`
- Windows: `.\scripts\check-cv-builder-integration.ps1`

Checks include:
- Reactive Resume source detection.
- Required env variables.
- URL and secret validation.
- OAuth discovery availability.
- Docker Compose config validation.

## CI

Workflow includes `cv-builder` job:

1. `corepack enable`
2. `pnpm install --frozen-lockfile`
3. `pnpm typecheck`
4. `pnpm test:ci`
5. `pnpm build`
6. `docker build -t parvagas-cv-builder-test ./reactive-resume`
7. Compose config validation for root/dev/prod files.

## Backup and Restore

- Main DB:
  - Backup: `pg_dump ... -d parvagas`
  - Restore: `psql ... -d parvagas`
- CV Builder DB:
  - Backup: `pg_dump ... -d parvagas_cv_builder`
  - Restore: `psql ... -d parvagas_cv_builder`
