# Parvagas Production Env Checklist

Use this checklist to fill production values and pass the readiness gate.

Canonical template file: .env.production.example

## 1. Required Variables (Hard Fail If Missing)

- [ ] SUPABASE_URL=https://mhxykmgubdfbjbxqqgzb.supabase.co
- [ ] SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oeHlrbWd1YmRmYmpieHFxZ3piIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE0Nzk5NSwiZXhwIjoyMDkyNzIzOTk1fQ.P7VpR2cg1fc9Pt_6VUv4rwLFRyuc8xy0HuWIgv4FeTI
- [ ] SUPABASE_STORAGE_BUCKET=parvagas-private
- [ ] JWT_SECRET=0fda5e2e-4e77-4bb7-8eeb-703b75a639bc
  - Rule: at least 32 chars, non-placeholder, random.
- [ ] NEXT_PUBLIC_SITE_URL=https://parvagas.vercel.app
- [ ] NEXT_PUBLIC_API_URL=https://api.parvagas.vercel.app
- [ ] CORS_ORIGIN=https://parvagas.vercel.app
  - If multiple: comma-separated HTTPS origins only.
- [ ] STORAGE_PROVIDER=supabase
- [ ] EMAIL_HOST=mail.ehdesigntech.co.uk
- [ ] EMAIL_PORT=587
- [ ] EMAIL_USER=parvagas@heliotheanalyst.co.uk
- [ ] EMAIL_PASS=Parvagas@2026
- [ ] EMAIL_FROM=parvagas@heliotheanalyst.co.uk
- [ ] EMAIL_SECURE=false
- [ ] EMAIL_REQUIRE_TLS=true
  - Rule: real email sender, ex. no-reply@parvagas.co.ao
  - Confirmed SMTP profile: `SMTP / STARTTLS / mail.ehdesigntech.co.uk / 587`.
  - Alternative supported by provider: `SMTPS / SSL / 465`.

## 2. Validation Rules (Must Pass)

- [ ] JWT_SECRET is not placeholder text and length >= 32.
- [ ] STORAGE_PROVIDER is exactly supabase.
- [ ] NEXT_PUBLIC_SITE_URL starts with https://
- [ ] NEXT_PUBLIC_API_URL starts with https://
- [ ] CORS_ORIGIN has no localhost, 127.0.0.1, or placeholder domains.
- [ ] EMAIL_FROM contains @ and is not local/placeholder.

## 3. Optional But Recommended

- [ ] AI_PROVIDER is not fallback in production.
  - If kept as fallback, CV parsing quality is reduced.
- [ ] MEILISEARCH_HOST is configured for better public search performance.
- [ ] MEILISEARCH_API_KEY is set if Meili requires auth.
- [ ] SENTRY_DSN is configured for error tracking.

## 4. Service Connectivity Checks (readiness:production:services)

- [ ] Supabase DB query works (jobs table reachable).
- [ ] Supabase storage bucket exists and is reachable.
- [ ] SMTP credentials pass transporter verify.
- [ ] Meili health check passes (if MEILISEARCH_HOST is set).

## 5. Paste-Ready Production Block

Use this template in your production env manager:

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=parvagas-private
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET_MIN_32
PORT=3001
NODE_ENV=production

NEXT_PUBLIC_SITE_URL=https://parvagas.vercel.app
NEXT_PUBLIC_API_URL=https://api.parvagas.vercel.app
CORS_ORIGIN=https://parvagas.vercel.app

STORAGE_PROVIDER=supabase

AI_PROVIDER=
AI_API_KEY=

EMAIL_HOST=mail.ehdesigntech.co.uk
EMAIL_PORT=587
EMAIL_USER=parvagas@heliotheanalyst.co.uk
EMAIL_PASS=Parvagas@2026
EMAIL_FROM=parvagas@heliotheanalyst.co.uk
EMAIL_SECURE=false
EMAIL_REQUIRE_TLS=true

MEILISEARCH_HOST=
MEILISEARCH_API_KEY=

SENTRY_DSN=

## 6. Command Gate

Run in order and stop on first failure:

1. npm run lint
2. npm run typecheck
3. npm run test
4. npm run build
5. npm run readiness:production
6. npm run readiness:production:services

## 7. Final Go/No-Go

- [ ] No FAIL lines in readiness outputs.
- [ ] Supabase bootstrap SQL already applied.
- [ ] Production domain and API domain are live over HTTPS.
- [ ] Candidate, company, and admin smoke flows verified.