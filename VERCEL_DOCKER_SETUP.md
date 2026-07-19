# Vercel + Docker Compose Setup Guide

## Architecture
```
Vercel Frontend (deployed)
        ↓
    HTTPS URLs
        ↓
Docker-Compose Backend + Services (self-hosted)
```

## Environment Configuration

### 1. Local Development (docker-compose.yml + local Next.js)

**Backend (.env)**
```env
# Frontend running locally on Next.js dev server
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

# CORS allows requests from localhost
CORS_ORIGIN=http://localhost:3000
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 2. Development Environment (docker-compose.dev.yml + Vercel Dev)

**Backend (.env.dev)**
```env
# Vercel deployment (dev preview/staging)
# Replace with your actual Vercel dev domain
FRONTEND_URL=https://dev-parvagas.vercel.app
BACKEND_URL=https://dev-api.parvagas.pt

# Allow multiple origins (Vercel + local testing)
# Comma-separated if you need multiple URLs
CORS_ORIGIN=https://dev-parvagas.vercel.app,https://dev.parvagas.pt

# Email branding
BRAND_NAME=Parvagas
BRAND_LOGO_URL=https://dev-parvagas.vercel.app/logo.png
BRAND_PRIMARY_COLOR=#dc2626

# Database (docker-compose service name)
DATABASE_URL=postgresql+psycopg://parvagas_user:change_me@postgres:5432/parvagas

# Redis
REDIS_URL=redis://redis:6379/0

# MinIO Storage
USE_MINIO_STORAGE=true
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET=parvagas
S3_ENDPOINT_URL=https://dev-storage.parvagas.pt

# CV Builder
RESUME_BUILDER_URL=https://dev-cv.parvagas.pt
RESUME_BUILDER_SECRET=<your-jwt-secret>

# AI / Ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_FREE_TIER_ENABLED=true
```

**Vercel Environment Variables (Dev)**
```env
# Browser-exposed (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_BACKEND_URL=https://dev-api.parvagas.pt
NEXT_PUBLIC_API_BASE_URL=https://dev-api.parvagas.pt
NEXT_PUBLIC_CV_BUILDER_URL=https://dev-cv.parvagas.pt
NEXT_PUBLIC_RESUME_BUILDER_URL=https://dev-cv.parvagas.pt
NEXT_PUBLIC_STORAGE_URL=https://dev-storage.parvagas.pt
NEXT_PUBLIC_S3_ENDPOINT=https://dev-storage.parvagas.pt
NEXT_PUBLIC_APP_URL=https://dev-parvagas.vercel.app

# Server-only (optional for /api/* routes that proxy to backend)
BACKEND_API_URL=https://api.dev.parvagas.pt
BACKEND_API_SECRET=<if-needed-for-auth>
```

### 3. Production Environment (docker-compose.prod.portainer.yml + Vercel Prod)

**Backend (.env.prod)**
```env
# Vercel production deployment
# Replace with your actual production Vercel domain
FRONTEND_URL=https://parvagas.vercel.app
BACKEND_URL=https://api.parvagas.pt

# Allow multiple origins (Vercel + direct domain)
# Comma-separated: CORS allows both
CORS_ORIGIN=https://parvagas.vercel.app,https://parvagas.pt

# Email branding
BRAND_NAME=Parvagas
BRAND_LOGO_URL=https://parvagas.vercel.app/logo.png
BRAND_PRIMARY_COLOR=#dc2626

# Database (docker-compose service name)
DATABASE_URL=postgresql+psycopg://parvagas_user:secure_password@postgres:5432/parvagas

# Redis
REDIS_URL=redis://redis:6379/0

# MinIO Storage (production)
USE_MINIO_STORAGE=true
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=<production-access-key>
MINIO_SECRET_KEY=<production-secret-key>
MINIO_SECURE=false
MINIO_BUCKET=parvagas
S3_ENDPOINT_URL=https://storage.parvagas.pt

# CV Builder (production)
RESUME_BUILDER_URL=https://cv.parvagas.pt
RESUME_BUILDER_SECRET=<your-jwt-secret>

# AI / Ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_FREE_TIER_ENABLED=true

# JWT
JWT_SECRET=<strong-random-secret-change-in-production>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Auth provider (if using Auth0)
AUTH_PROVIDER=local

# Email
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Parvagas <noreply@parvagas.pt>

# Admin
SUPER_ADMIN_EMAIL=admin@parvagas.pt
```

**Vercel Environment Variables (Production)**
```env
# Browser-exposed (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_BACKEND_URL=https://api.parvagas.pt
NEXT_PUBLIC_API_BASE_URL=https://api.parvagas.pt
NEXT_PUBLIC_CV_BUILDER_URL=https://cv.parvagas.pt
NEXT_PUBLIC_RESUME_BUILDER_URL=https://cv.parvagas.pt
NEXT_PUBLIC_STORAGE_URL=https://storage.parvagas.pt
NEXT_PUBLIC_S3_ENDPOINT=https://storage.parvagas.pt
NEXT_PUBLIC_APP_URL=https://parvagas.vercel.app

# Server-only (optional)
BACKEND_API_URL=https://api.parvagas.pt
BACKEND_API_SECRET=<if-needed-for-auth>
```

## DNS Configuration

```
# Production DNS (Cloudflare / your DNS provider)
api.parvagas.pt          A record → your-server-ip
cv.parvagas.pt           A record → your-server-ip
storage.parvagas.pt      A record → your-server-ip

# Development DNS (optional, for testing before prod)
dev-api.parvagas.pt      A record → your-server-ip
dev-cv.parvagas.pt       A record → your-server-ip
dev-storage.parvagas.pt  A record → your-server-ip

# Or use wildcard
*.parvagas.pt            A record → your-server-ip
*.dev.parvagas.pt        A record → your-server-ip
```

## Vercel Configuration Steps

### 1. Connect Git Repository
- Connect your GitHub repo to Vercel
- Select the branch for deployments

### 2. Configure Environment Variables
- Go to **Settings** → **Environment Variables**
- Add the variables above for each environment (Development/Preview/Production)
- For each environment, add the corresponding NEXT_PUBLIC_* variables

### 3. Build Command
```bash
npm run build
# or
pnpm build
```

### 4. Output Directory
```
.next
```

## Request Flow

### Vercel Frontend → Docker Backend

```
1. Browser requests to https://parvagas.vercel.app
   ↓
2. Next.js component uses fetch(process.env.NEXT_PUBLIC_BACKEND_URL)
   ↓
3. Browser makes CORS request to https://api.parvagas.pt
   ↓
4. Docker FastAPI backend receives request
   ↓
5. Backend CORS middleware validates:
   - Request origin: https://parvagas.vercel.app
   - Against allowed: CORS_ORIGIN + FRONTEND_URL env vars
   ↓
6. If origin matches → request allowed
   If not → CORS error (403)
   ↓
7. Backend returns response with CORS headers
   ↓
8. Browser receives response
```

## Troubleshooting

### CORS Errors (403)
- Check Vercel domain matches `FRONTEND_URL` or `CORS_ORIGIN` on backend
- CORS_ORIGIN can be comma-separated for multiple origins
- Example: `CORS_ORIGIN=https://parvagas.vercel.app,https://parvagas.pt`

### Connection Timeout
- Verify DNS records (A records) point to your server IP
- Check Traefik is running: `docker logs -f proxy`
- Verify SSL certificates: `docker logs -f proxy | grep -i cert`

### 404 on API Endpoints
- Check backend is running: `docker compose -f docker-compose.prod.portainer.yml logs backend-python`
- Verify Traefik routing: check `deploy/traefik/dynamic/parvagas.yml`

### S3/Storage Access Issues
- Verify `S3_ENDPOINT_URL` is publicly accessible
- Check MinIO is running: `docker compose -f docker-compose.prod.portainer.yml logs minio`
- Verify CORS on MinIO bucket

## Example: Update Docker Compose for Vercel

In **docker-compose.prod.portainer.yml**, update the backend environment:

```yaml
backend-python:
  environment:
    # ... other vars ...
    FRONTEND_URL: https://parvagas.vercel.app,https://parvagas.pt
    CORS_ORIGIN: https://parvagas.vercel.app,https://parvagas.pt
    BACKEND_URL: https://api.parvagas.pt
    # ... rest of config ...
```

Then redeploy:
```bash
docker compose -f docker-compose.prod.portainer.yml up -d --force-recreate backend-python
```

## Summary

| Component | Dev | Prod |
|-----------|-----|------|
| Frontend | https://dev-parvagas.vercel.app | https://parvagas.vercel.app |
| Backend API | https://dev-api.parvagas.pt | https://api.parvagas.pt |
| Parvagas CV Builder | https://dev-cv.parvagas.pt | https://cv.parvagas.pt |
| Storage | https://dev-storage.parvagas.pt | https://storage.parvagas.pt |
| CORS Origin | https://dev-parvagas.vercel.app | https://parvagas.vercel.app |
| DNS | *.dev.parvagas.pt | *.parvagas.pt |
