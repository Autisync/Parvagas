# Parvagas — Deploy & Trust Runbook (F1)

What's wired in-repo vs. what needs your cloud/DNS/provider accounts. Trust
matters in the AO market — this covers the infra that earns it.

## P0 — Deploy: frontend + backend + managed Postgres
**In-repo:** Dockerfile (multi-stage, non-root), `docker-entrypoint.sh` runs
`alembic upgrade head` then Gunicorn (uvicorn workers); `/health` (liveness) and
`/ready` (DB+Redis) probes.
**You provide (cloud):**
- Frontend → Vercel/Netlify (Next 16). Set `NEXT_PUBLIC_API_URL=https://api.parvagas.pt`, `NEXT_PUBLIC_SITE_URL=https://parvagas.pt`.
- Backend container → a host with a **low-latency region for AO** (e.g. `af-south-1` Cape Town, or EU-South). Set the prod env (see below).
- **Managed Postgres** (e.g. Neon/RDS/Supabase) with **automatic daily backups + PITR**. Put its URL in `DATABASE_URL` (`postgresql+psycopg://…`). Managed Redis for Celery.
- Run once on the managed DB: `alembic upgrade head` (the entrypoint does this automatically on boot).

## P0 — Domain + HTTPS/TLS
- DNS: `parvagas.pt` → frontend; `api.parvagas.pt` → backend.
- TLS certs via the platform (Vercel auto; for the API use Caddy/Traefik/ALB with auto-cert). Force **http→https** at the proxy.
- **HSTS + security headers are already emitted** by the backend in `app/main.py` (HSTS only when `APP_ENV` is production; plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). Ensure the frontend proxy also sends HSTS.
- Set `TRUSTED_HOSTS=parvagas.pt,api.parvagas.pt` and `CORS_ORIGIN=https://parvagas.pt`.

## P1 — Cloud storage for CVs
- Adapter: `StorageService` (local disk by default). Set `STORAGE_PROVIDER` + bucket creds (Supabase Storage / Cloudflare R2) to move off disk.
- **Validation in place:** type (PDF/DOCX) + MIME + **5 MB size cap** on apply uploads.
- **Antivirus hook in place:** `StorageService.scan_clean()` — enable with `ANTIVIRUS_ENABLED=true` + a ClamAV service (`CLAMAV_HOST`/`CLAMAV_PORT`); `ANTIVIRUS_FAIL_OPEN=false` to reject on scanner error.

## P1 — Transactional email (SPF/DKIM/DMARC)
- SMTP configured via `SMTP_HOST/PORT/USER/PASS/FROM`. Flows: email verification, welcome, password reset, application received.
- **Deliverability DNS (at your domain):**
  - SPF: `v=spf1 include:<provider> ~all`
  - DKIM: provider-issued CNAME/TXT selector records.
  - DMARC: `_dmarc.parvagas.pt TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@parvagas.pt"`
- Test after DNS propagates: register → verify email; forgot → reset; trigger a job alert. Check inbox placement (mail-tester.com).

## P1 — Sentry + uptime + CAPTCHA
- **Sentry:** already env-gated (`init_sentry()` in `app/main.py`). Set `SENTRY_DSN` + `SENTRY_TRACES_SAMPLE_RATE`. Add the frontend Sentry SDK too if desired.
- **Uptime:** point an external monitor (UptimeRobot/BetterStack/Pingdom) at `https://api.parvagas.pt/health` and `https://parvagas.pt` (1-min interval, alert on 2 failures).
- **CAPTCHA (anti-abuse on register + apply):** hook in place (`app/core/captcha.py`). Enable with `CAPTCHA_PROVIDER=turnstile|hcaptcha|recaptcha`, `CAPTCHA_SECRET=…`, `CAPTCHA_REQUIRED=true`. Add the matching widget token on the frontend forms (send as `x-captcha-token` header or `captchaToken`). Rate limiting already protects auth (slowapi).

## Analytics (from F2)
- Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=parvagas.pt` (and `NEXT_PUBLIC_PLAUSIBLE_SRC` if self-hosting). Submit `https://parvagas.pt/sitemap.xml` to Google Search Console.

## Pre-launch checklist
- [ ] Secrets set in prod (NOT committed): `JWT_SECRET` (strong), `DATABASE_URL`, `ADMIN_SIGNUP_KEY`, SMTP, Sentry, CAPTCHA. Rotate any value previously exposed (see `SECURITY_ROTATION.md`).
- [ ] `APP_ENV=production` (enables HSTS + the secret fail-fast).
- [ ] Managed Postgres backups verified (do a test restore).
- [ ] `/ready` returns 200 in prod; uptime monitor green.
- [ ] Email deliverability passes (SPF/DKIM/DMARC aligned).
- [ ] CAPTCHA enabled on register/apply; rate limits confirmed.
