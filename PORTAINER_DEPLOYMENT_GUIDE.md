# Portainer Deployment Guide

## Access Portainer

**URL:** https://46.224.205.82:9443 (or your Portainer URL)

Or from your server:
```bash
docker ps -a | grep portainer
# Get the container ID and access via port
```

---

## Deploying with Portainer

### Method 1: Import from Git Repository (Recommended)

#### Step 1: Connect Git Repository

1. Go to **Portainer** → **Stacks** → **Add Stack**
2. Select **Git repository**
3. Enter repository URL: `https://github.com/<your-org>/<your-repo>`
4. Click **Connect**
5. Select branch: `main` (or your deployment branch)

#### Step 2: Select Compose File

1. Choose **docker-compose.prod.portainer.yml** (for production)
   - Or **docker-compose.dev.yml** (for development)
2. Click **Load Compose file**

#### Step 3: Set Environment Variables

1. Scroll to **Environment variables** section
2. Select **Load variables from .env file**
3. Upload `.env.prod` (or paste contents)

**OR manually add each variable:**
- Click **+ Add Environment variable**
- For each variable in `.env.prod`, add:
  - Name: `JWT_SECRET`
  - Value: `<your-value>`
  - Repeat for all variables

**Critical Variables to Add:**
```
JWT_SECRET=<strong-random-secret>
POSTGRES_PASSWORD=<secure-password>
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
RESUME_BUILDER_SECRET=<jwt-secret>
```

#### Step 4: Deploy Stack

1. Click **Deploy the stack**
2. Wait for all services to start (2-5 minutes)
3. Verify in **Portainer** → **Containers**

---

### Method 2: Manual Upload

If Git repository is not available:

#### Step 1: Upload Compose File

1. Go to **Portainer** → **Stacks** → **Add Stack**
2. Select **Docker Compose**
3. Paste content of `docker-compose.prod.portainer.yml` into the editor
4. Click **Next**

#### Step 2: Set Variables

Same as Method 1, Step 3

#### Step 3: Deploy

Click **Deploy the stack**

---

## Creating .env.prod for Portainer

Create this file locally and upload to Portainer (or paste contents):

```bash
# backend-python/.env.prod
APP_ENV=production
DEBUG=false
PORT=8000

# Database
DATABASE_URL=postgresql+psycopg://parvagas:SECURE_PASSWORD@postgres:5432/parvagas
POSTGRES_USER=parvagas
POSTGRES_PASSWORD=SECURE_PASSWORD
POSTGRES_DB=parvagas

# JWT
JWT_SECRET=GENERATE_STRONG_RANDOM_STRING_HERE
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Admin
ADMIN_SIGNUP_KEY=RANDOM_KEY_HERE
MODERATOR_SIGNUP_KEY=RANDOM_KEY_HERE
SUPER_ADMIN_EMAIL=admin@parvagas.pt

# URLs
FRONTEND_URL=https://parvagas.vercel.app
BACKEND_URL=https://api.parvagas.pt
CORS_ORIGIN=https://parvagas.vercel.app,https://parvagas.pt

# Storage - MinIO
S3_ENDPOINT_URL=https://storage.parvagas.pt
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=SECURE_MINIO_PASSWORD
S3_REGION=us-east-1
S3_BUCKET=cvs

# Redis (internal service names)
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# Email
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Parvagas <noreply@parvagas.pt>

# Parvagas CV Builder
RESUME_BUILDER_URL=https://cv.parvagas.pt
RESUME_BUILDER_SECRET=GENERATE_STRONG_RANDOM_STRING_HERE

# Ollama (free-tier AI)
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_FREE_TIER_ENABLED=true
OLLAMA_TIMEOUT_SECONDS=60

# Cloud AI (for paid tiers)
RESUME_AI_ENABLED=true
RESUME_AI_PROVIDER=openai
RESUME_AI_BASE_URL=https://api.openai.com/v1
RESUME_AI_API_KEY=sk-your-api-key-here
RESUME_AI_MODEL=gpt-4-turbo

# Traefik
API_HOST=api.parvagas.pt
STORAGE_HOST=storage.parvagas.pt
CV_HOST=cv.parvagas.pt
TRAEFIK_NETWORK=proxy

# Security
TRUSTED_HOSTS=parvagas.pt,api.parvagas.pt,cv.parvagas.pt,storage.parvagas.pt,parvagas.vercel.app
CAPTCHA_REQUIRED=true
SENTRY_DSN=optional-sentry-dsn

# Deploy automation (optional)
DEPLOY_WEBHOOK_URL=https://portainer.example.com/api/stacks/webhook/...
DEPLOY_GIT_PUSH=false
```

---

## Managing Stacks in Portainer

### Update Existing Stack

1. Go to **Portainer** → **Stacks**
2. Click on your stack (e.g., "parvagas-prod")
3. Click **Editor** at the top
4. Update the compose file content
5. Click **Update the stack**

### Update Environment Variables

1. Go to **Portainer** → **Stacks** → Your Stack
2. Click **Environment variables**
3. Edit each variable
4. Click **Update the stack**

### Restart Services

1. Go to **Portainer** → **Stacks** → Your Stack
2. Click **Stop**
3. Wait for all containers to stop
4. Click **Start**

### View Logs

1. Go to **Portainer** → **Containers**
2. Click on container (e.g., "backend-python")
3. Click **Logs** tab
4. Watch real-time logs

### Delete Stack

1. Go to **Portainer** → **Stacks** → Your Stack
2. Click **Delete** (careful! Removes containers and volumes)

---

## Portainer Best Practices

### 1. Separate Stacks for Dev/Prod

Create two separate stacks:
- **Stack name:** `parvagas-dev` (uses docker-compose.dev.yml)
- **Stack name:** `parvagas-prod` (uses docker-compose.prod.portainer.yml)

This prevents accidental prod deployments.

### 2. Use Environment Variables from File

Instead of hardcoding values:
- Create `.env.prod` and `.env.dev` files
- Upload to Portainer
- Reference in compose file as `${VARIABLE_NAME}`

### 3. Set Resource Limits

In each service definition:
```yaml
services:
  backend-python:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 4. Configure Restart Policy

```yaml
services:
  backend-python:
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 3
      window: 120s
```

### 5. Monitor Resource Usage

- Go to **Dashboard** → View CPU, Memory, Network usage
- Go to **Containers** → Click container → **Stats** tab

---

## Health Checks in Portainer

Add health checks to detect failing services:

```yaml
services:
  backend-python:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
  
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U parvagas"]
      interval: 30s
      timeout: 10s
      retries: 3
```

View health status in **Portainer** → **Containers** → Check "Status" column

---

## Automated Deployment with Portainer Webhooks

### Setup Webhook for Auto-Deployment

1. Go to **Portainer** → **Stacks** → Your Stack
2. Scroll to **Webhooks**
3. Click **Create webhook**
4. Copy webhook URL
5. Store securely: `DEPLOY_WEBHOOK_URL=<webhook-url>`

### Trigger Deployment from CI/CD

```bash
# After pushing to main branch, trigger stack update
curl -X POST "https://portainer.example.com/api/stacks/webhook/abc123def456"

# Or use in GitHub Actions
- name: Deploy to Production
  run: |
    curl -X POST "${{ secrets.PORTAINER_WEBHOOK_URL }}"
```

### Alternative: Manual Deployment Button

Use **Admin Deploy Panel** in parvagas.pt:
- Go to `/Portal/Admin/deploy`
- View pending commits
- Click "🚀 Deploy" button
- Automatically calls DEPLOY_WEBHOOK_URL or git push

---

## Troubleshooting in Portainer

### Check Container Status

1. Go to **Portainer** → **Containers**
2. Look for red status indicators
3. Click container → **Logs** tab
4. Read error messages

### View Event History

1. Go to **Portainer** → **Events**
2. Sort by timestamp
3. See what failed and when

### Reset/Restart Services

```bash
# Via Portainer UI
1. Containers → Select backend-python → Restart

# Via Docker CLI on server
docker compose -f docker-compose.prod.portainer.yml restart backend-python
docker compose -f docker-compose.prod.portainer.yml logs -f backend-python
```

### Check Disk Space

```bash
# On server via SSH
df -h
# If full, cleanup: docker system prune
```

---

## Common Issues & Fixes

### Issue: Stack stuck in "Updating" state

**Fix:**
```bash
# SSH to server
docker compose -f docker-compose.prod.portainer.yml down
docker compose -f docker-compose.prod.portainer.yml up -d
```

### Issue: Containers not starting after environment variable change

**Fix:**
1. Go to Portainer → Stacks → Your Stack
2. Click "Stop"
3. Wait 30 seconds
4. Click "Start"

### Issue: Traefik not routing to services

**Fix:**
1. Check: `docker logs -f proxy`
2. Verify labels in compose file are correct
3. Restart Traefik: `docker compose -f docker-compose.prod.portainer.yml restart proxy`

### Issue: Let's Encrypt certificate not renewing

**Fix:**
```bash
# SSH to server
docker exec proxy certbot renew
docker compose -f docker-compose.prod.portainer.yml restart proxy
```

---

## Portainer Dashboard Checklist

- [ ] All containers show "Running" status (green)
- [ ] No containers in "Restarting" state
- [ ] Resource usage is within limits (CPU < 80%, Memory < 80%)
- [ ] Volumes show as mounted
- [ ] Networks show as connected
- [ ] No error messages in logs
- [ ] Health checks passing (if configured)

---

## Backup Configuration in Portainer

### Export Stack Configuration

1. Go to **Portainer** → **Stacks** → Your Stack
2. Click **Editor**
3. Copy compose file content
4. Save locally as `docker-compose.prod.portainer.yml.backup`

### Export Environment Variables

1. Go to **Portainer** → **Stacks** → Your Stack
2. Click **Environment variables**
3. Copy all values to local `.env.prod.backup`

Store backups in Git (encrypted branch) or secure location.

---

## Security Best Practices

### 1. Use Portainer Secrets (if available)

Some Portainer versions support secrets:
1. Go to **Settings** → **Secrets**
2. Add sensitive values
3. Reference in compose as `${secret: secret_name}`

### 2. Restrict Portainer Access

1. Go to **Settings** → **Authentication**
2. Set up 2FA (if available)
3. Restrict IP access to admin IPs only

### 3. Audit Logs

1. Go to **Portainer** → **Activity logs**
2. Review who changed what
3. Export logs periodically

### 4. Never Commit Secrets to Git

- Use `.env.prod` (local only, gitignored)
- Or store in Portainer secrets
- Never put passwords in compose files

---

## Next Steps

1. **Create `.env.prod`** with all variables filled in
2. **Upload to Portainer** as environment variables
3. **Deploy stack** via Portainer UI
4. **Verify services** are running in Portainer dashboard
5. **Check logs** for any errors
6. **Test endpoints** from browser
7. **Monitor dashboard** for health

You're ready to deploy! 🚀
