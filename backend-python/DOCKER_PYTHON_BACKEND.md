# Docker Python Backend Guide

## Quick Start

### 1. Copy Environment File

```bash
cp backend-python/.env.example backend-python/.env
```

### 2. Update docker-compose.yml

Replace the current `docker-compose.yml` with `docker-compose.yml`:

```bash
mv docker-compose.yml docker-compose-old.yml
mv docker-compose.yml docker-compose.yml
```

### 3. Build and Start Services

For Python backend:
```bash
docker compose up -d --build
```

For Python backend with scheduler:
```bash
docker compose --profile python-backend-beat up -d --build
```

## Services

### Required Services (Python Backend)

1. **PostgreSQL** - Database
   ```bash
   docker compose up postgres
   ```

2. **Redis** - Cache and message broker
   ```bash
   docker compose up redis
   ```

3. **Backend Python** - FastAPI application
   ```bash
  docker compose up backend-python
   ```

4. **Celery Worker** - Async task processing
   ```bash
  docker compose up celery-worker
   ```

5. **Celery Beat** (Optional) - Scheduled tasks
   ```bash
   docker compose --profile python-backend-beat up celery-beat
   ```

## Container Management

### View Logs
```bash
docker compose logs -f backend-python
docker compose logs -f celery-worker
docker compose logs -f postgres
docker compose logs -f redis
```

### Access Container Shell
```bash
docker compose exec backend-python /bin/sh
```

### Run Alembic Migrations
```bash
docker compose exec backend-python alembic upgrade head
```

### Inspect Database
```bash
docker compose exec postgres psql -U parvagas_user -d parvagas
```

### Inspect Redis
```bash
docker compose exec redis redis-cli
```

## Environment Variables

Key variables for `.env` file:

```env
# App
APP_ENV=development
PORT=8000

# Database
DATABASE_URL=postgresql+psycopg://parvagas_user:password@postgres:5432/parvagas

# Redis
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# JWT
JWT_SECRET=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=60

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

# SMTP (Email)
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=password
SMTP_FROM=Parvagas <noreply@example.com>

# Upload
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=10
```

## Testing Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### Register User
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "full_name": "Test User",
    "role": "candidate"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "role_hint": "candidate"
  }'
```

### Verify Email
```bash
curl -X POST http://localhost:8000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN"}'
```

## Troubleshooting

### Backend fails to start
- Check logs: `docker compose logs backend-python`
- Verify environment variables in `.env`
- Ensure PostgreSQL is running and healthy

### Celery worker not processing tasks
- Check Redis is running: `docker compose logs redis`
- Check Celery worker logs: `docker compose logs celery-worker`
- Verify CELERY_BROKER_URL is correct

### Database connection issues
- Verify PostgreSQL is healthy: `docker compose ps`
- Check DATABASE_URL in `.env`
- Run migrations: `docker compose exec backend-python alembic upgrade head`

### Port conflicts
- If port 8000 is in use, change PORT in `.env`
- If port 5432 is in use, use different host port in docker-compose

## Production Deployment

For production:

1. Update all environment variables with real values
2. Use strong JWT_SECRET
3. Set APP_ENV=production
4. Use managed PostgreSQL/Redis services
5. Scale Celery workers as needed
6. Setup proper SMTP configuration
7. Configure CORS properly
8. Use environment-specific secrets management

## Switching Frontend to Python Backend

To use the Python backend from the frontend:

Local development:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Docker service name:

```bash
NEXT_PUBLIC_API_URL=http://backend-python:8000
```

## Running The Python Backend Stack

The runtime stack is Python-only.
