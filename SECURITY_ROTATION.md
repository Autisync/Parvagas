# Security Rotation and Secret Handling

## Scope

This project runs with a Python backend in backend-python and frontend in src.

## Environment Files

Committed examples:
- .env.example
- .env.development.example
- .env.production.example
- backend-python/.env.example

Local non-committed files:
- .env
- .env.local
- .env.*.local
- backend-python/.env
- backend-python/.env.*.local

## .gitignore Protection

Protect these paths:

```text
.env
.env.local
.env.*.local
.env.production
.env.staging
.env.development
backend-python/.env
backend-python/.env.*.local
backend-python/.env.production
uploads/
backend-python/uploads/
```

Allow these examples:

```text
!.env.example
!.env.production.example
!.env.development.example
!.env.local.example
!backend-python/.env.example
```

## Critical Secrets to Rotate

- JWT_SECRET
- ADMIN_SIGNUP_KEY
- DATABASE_URL credentials
- SMTP_PASS
- SUPABASE_SERVICE_ROLE_KEY (if used)

## Rotation Cadence

- JWT and admin keys: every 6-12 months
- SMTP credentials: every 3-6 months
- DB credentials: on role changes and incidents
- Immediate rotation on any leak suspicion

## Verification Checklist

- backend-python/.env is not tracked
- No secrets in git history for active branches
- Health endpoints still pass after secret rotation
- Email sending still works after SMTP rotation

## Incident Procedure

1. Revoke exposed credentials immediately.
2. Generate new secrets and update backend-python/.env.
3. Restart services with docker compose up -d.
4. Verify health and key workflows.
5. Document incident and rotate dependent tokens.

---

## F0 Remediation status (2026-06-21)

### Done in-repo (this commit)
- **`.env.docker` untracked** (`git rm --cached`) and added to `.gitignore` — stops future leaks. The file remains locally for the running stack; `.env.docker.example` is the committed template.
- **Hardcoded Postgres password removed** from `docker-compose.yml` and `docker-compose-updated.yml` — `DATABASE_URL` now comes from the `env_file` (`.env.docker`), which uses the `postgresql+psycopg://` driver.
- **`JWT_SECRET` rotated** to a fresh 96-char random value (old sessions invalidated). Verified: stack healthy, DB+Redis OK, admin login works.

### ⚠️ Still required (manual — old values remain in Git history & at providers)
1. **Purge Git history** of the leaked values (they were committed before this fix and pushed to `origin/main`). This rewrites shared history and needs a force-push + team coordination:
   ```bash
   pip install git-filter-repo
   git filter-repo --path .env.docker --invert-paths
   git filter-repo --replace-text <(printf 'REDACTED==>REDACTED\n')
   git push --force origin main      # coordinate with anyone who has cloned
   ```
2. **Rotate the actual Postgres password** (the in-repo value is unchanged to avoid breaking the live volume):
   ```bash
   docker compose exec postgres psql -U parvagas_user -d parvagas \
     -c "ALTER USER parvagas_user WITH PASSWORD 'NEW_STRONG_PASS';"
   # then update POSTGRES_PASSWORD + DATABASE_URL in .env.docker and restart
   ```
3. **Rotate provider credentials** at their source (cannot be done from the repo):
   - SMTP / email account password (`SMTP_PASS` / `EMAIL_PASS`).
   - Skima / any third-party API key.
4. **Rotate the admin bootstrap password**: the seeded super-admin password equals the original `ADMIN_SIGNUP_KEY`. Set a new `ADMIN_SIGNUP_KEY` and reset the admin password (login → change password, or re-run the seed against a fresh value).
