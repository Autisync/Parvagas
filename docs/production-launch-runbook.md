# Parvagas Production Launch Runbook

This runbook turns the remaining live-system requirements into executable checks and account-level handoff steps.

## 0. Database Schema Cutover (Python API)

Schema is now owned by Alembic migrations, not `create_all()` (see
`backend-python/docs/adr/ADR-001`). The container entrypoint runs
`alembic upgrade head` automatically on boot.

- **Fresh database:** nothing to do — the entrypoint creates all tables and
  seeds the super-admin (requires `ADMIN_SIGNUP_KEY` and `SUPER_ADMIN_EMAIL`).
- **Database that predates ADR-001** (tables were created by the old
  `create_all` path and have no `alembic_version` row): mark it as migrated once
  so the idempotent root migration no-ops, then upgrade:

  ```bash
  # one-time, against the existing DB
  alembic stamp 20260516_0000   # base schema already present
  alembic upgrade head          # applies seed + admin_level + applications
  ```

- **Verify after deploy:** `GET /ready` must return 200 with
  `{"checks":{"database":"ok","redis":"ok"}}`. A 503 means a dependency is
  unreachable — do not route traffic.
- The API refuses to start in a production `APP_ENV` if `JWT_SECRET`,
  `DATABASE_URL`, or `ADMIN_SIGNUP_KEY` are missing or still placeholders.

## 1. Required Accounts And Services

Create or confirm these services before launch:

- Supabase production project.
- Private Supabase Storage bucket, recommended name: `parvagas-private`.
- SMTP/email provider for transactional mail.
- Production hosting for the Next.js frontend.
- Production hosting for the Python API.
- Optional MeiliSearch service for faster public job search.
- Monitoring/error tracking service, such as Sentry or the hosting provider's runtime logs.
- Domain and DNS access for the production frontend and API hostnames.

## 2. Required Environment Variables

Set these in production. Use HTTPS domains here, not localhost.

```bash
NODE_ENV=production
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=parvagas-private
JWT_SECRET=
PORT=3001

NEXT_PUBLIC_SITE_URL=https://YOUR_FRONTEND_DOMAIN
NEXT_PUBLIC_API_URL=https://YOUR_API_DOMAIN
CORS_ORIGIN=https://YOUR_FRONTEND_DOMAIN

STORAGE_PROVIDER=supabase

AI_PROVIDER=
AI_API_KEY=

EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
EMAIL_SECURE=false

MEILISEARCH_HOST=
MEILISEARCH_API_KEY=

SENTRY_DSN=
```

Rules:

- `JWT_SECRET` must be a long random value, at least 32 characters.
- `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_URL` must be HTTPS URLs.
- `CORS_ORIGIN` must not include localhost in production.
- `STORAGE_PROVIDER` must be `supabase` in production.
- Never commit real secrets.

## 3. Database Bootstrap

Apply the schema:

```bash
DATABASE_URL="postgresql://..." npm run db:bootstrap
```

Then seed real demo data only if appropriate:

```bash
npm run db:seed:real
```

## 4. Storage

In Supabase:

- Create private bucket `parvagas-private`.
- Do not make uploaded CVs public.
- Use signed URLs for access.
- Confirm file upload limits match the app's 8 MB CV limit.

The app already uses the Supabase storage adapter when:

```bash
STORAGE_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET=parvagas-private
```

## 5. Email

Configure SMTP variables and verify:

```bash
npm run readiness:production:services
```

The app logs skipped notifications if email is not configured, but that is not acceptable for production launch.

## 6. Search

Option A: launch with database filtering only.

Option B: configure MeiliSearch:

```bash
MEILISEARCH_HOST=
MEILISEARCH_API_KEY=
npm run reindex:jobs
```

Only public approved jobs should be indexed.

## 7. Production Readiness Gate

Run before every production deploy:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run readiness:production
```

With network/service validation:

```bash
npm run readiness:production:services
```

The readiness script fails on unsafe live settings such as local storage, localhost URLs, placeholder secrets, missing email, or missing storage bucket.

## 8. Deployment

Suggested split:

- Frontend: Next.js app.
- API: Python backend service.
- Database/storage: Supabase.
- Optional search: MeiliSearch.

Production start commands:

```bash
npm ci
npm run build
npm run start
```

API:

```bash
docker compose up -d --build backend-python celery-worker
docker compose exec backend-python alembic upgrade head
```

## 9. Monitoring And Backups

Minimum launch requirements:

- Supabase automatic backups enabled.
- API logs retained by host.
- Frontend runtime/build logs retained by host.
- Error tracking configured with `SENTRY_DSN` or equivalent host integration.
- Alerting for API downtime and high error rate.

## 10. Final Smoke Test

After deployment:

- `GET /health` returns `{"status":"ok"}`.
- Public `/Vagas-Disponiveis` loads real approved jobs.
- Candidate can register, upload CV, approve profile, save job, and apply.
- Company can register, create job, and see applications.
- Admin can approve jobs and verify companies.
- Emails are sent for application/status events.
- Uploaded CVs are not publicly accessible without a signed URL.
