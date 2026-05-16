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
