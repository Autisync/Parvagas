# Deployment and Server Setup (Python Backend)

## Overview

This guide covers deploying the Parvagas Python backend (FastAPI + Celery) in production.

## System Requirements

- Python runtime is containerized via Docker
- Docker Engine 24+
- Docker Compose v2+
- 2+ CPU cores, 4GB+ RAM recommended
- 20GB+ storage

## Pre-Deployment Checklist

- Docker and Docker Compose installed
- backend-python/.env configured
- PostgreSQL and Redis reachable
- SMTP credentials configured
- TLS termination configured in reverse proxy
- Firewall allows backend port

## Environment Variables

Create backend-python/.env with required values:

```env
APP_ENV=production
PORT=8000
DATABASE_URL=postgresql+psycopg://parvagas_user:change_me@postgres:5432/parvagas
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
JWT_SECRET=change_me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
FRONTEND_URL=https://your-frontend-domain.com
BACKEND_URL=https://your-backend-domain.com
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Parvagas <info@yourdomain.com>"
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10
```

## Installation and Startup

```bash
git clone https://github.com/Autisync/Parvagas.git
cd Parvagas
cp backend-python/.env.example backend-python/.env
# edit backend-python/.env
docker compose up -d --build
docker compose exec backend-python alembic upgrade head
```

## Runtime Commands

```bash
docker compose ps
docker compose logs -f backend-python
docker compose logs -f celery-worker
```

## Health Checks

PowerShell:

```powershell
Invoke-RestMethod -Uri 'http://localhost:8000/health' -Method Get
Invoke-RestMethod -Uri 'http://localhost:8000/ready' -Method Get
```

## Reverse Proxy Notes

- Proxy /api requests to backend-python:8000
- Keep TLS/HTTPS termination in proxy
- Preserve X-Forwarded-For and X-Forwarded-Proto headers

## Rollback Strategy

- Keep previous image tags in registry
- Roll back by redeploying previous tag
- Restore DB from latest backup if schema rollback is required

## Troubleshooting

- Migration issues: docker compose exec backend-python alembic current
- Celery queue issues: docker compose logs celery-worker
- Redis connectivity: docker compose exec redis redis-cli ping
- DB connectivity: docker compose exec postgres pg_isready
