# Docker Deployment Guide (Backend + PostgreSQL)

This guide runs the Parvagas backend and PostgreSQL with Docker Compose for production-like deployments.

## 1) Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- A configured DNS/domain if deploying publicly

## 2) Environment Setup

1. Copy environment template:

```bash
cp .env.docker.example .env.docker
```

2. Fill in strong secrets in `.env.docker`:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ADMIN_SIGNUP_KEY`
- SMTP credentials

3. Ensure `server/.env` exists for app-specific values not in `.env.docker`.
4. Set frontend/backend URLs and SMTP values explicitly in `.env.docker`:

```bash
FRONTEND_URL=https://your-frontend-domain.com
BACKEND_URL=https://your-backend-domain.com
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-pass
SMTP_FROM=no-reply@example.com
```

## 3) Build and Start

Run preflight validation first:

```bash
npm run docker:preflight
```

For stricter production checks:

```bash
npm run docker:preflight:strict
```

Then start the stack:

```bash
docker compose --env-file .env.docker up -d --build
```

Shortcut command:

```bash
npm run docker:up
```

Strict shortcut:

```bash
npm run docker:up:strict
```

## 4) Verify Health

```bash
docker compose ps
docker compose logs backend --tail=100
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

Expected `/health` response includes:

```json
{ "success": true, "status": "ok" }
```

## 5) Run DB Migrations

```bash
docker compose exec backend npm run db:migrate
```

Optional readiness check:

```bash
docker compose exec backend npm run readiness:production
```

Optional email smoke test:

```bash
docker compose exec backend npm run email:test -- user@example.com
```

Optional CV parsing smoke test:

```bash
docker compose exec backend npm run cv:test -- ./fixtures/sample-cv.pdf
```

Optional seed:

```bash
docker compose exec backend npm run db:seed
```

## 6) Optional Services

- Redis profile:

```bash
docker compose --profile cache --env-file .env.docker up -d
```

- pgAdmin profile:

```bash
docker compose --profile admin --env-file .env.docker up -d
```

## 7) Backup and Restore

Backup database:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup.sql
```

Restore database:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backup.sql
```

## 8) Update and Restart

```bash
docker compose pull
docker compose --env-file .env.docker up -d --build
```

## 9) Stop Stack

```bash
docker compose down
```

To stop and remove named volumes too:

```bash
docker compose down -v
```
