# Parvagas Production Launch Runbook

This runbook turns the remaining live-system requirements into executable checks and account-level handoff steps.

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
