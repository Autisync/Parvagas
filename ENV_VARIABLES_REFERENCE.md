# Environment Variables Reference — Vercel + Docker

## Quick Reference Table

### Backend Environment Variables

| Variable | Dev Value | Prod Value | Purpose |
|----------|-----------|-----------|---------|
| `FRONTEND_URL` | `https://dev.parvagas.pt` or `https://dev-parvagas.vercel.app` | `https://parvagas.vercel.app` | Frontend origin for CORS + email branding |
| `CORS_ORIGIN` | `https://dev-parvagas.vercel.app,https://dev.parvagas.pt` | `https://parvagas.vercel.app,https://parvagas.pt` | Additional allowed CORS origins |
| `BACKEND_URL` | `https://api.dev.parvagas.pt` | `https://api.parvagas.pt` | Backend public URL for links in emails |
| `S3_ENDPOINT_URL` | `https://storage.dev.parvagas.pt` | `https://storage.parvagas.pt` | MinIO public URL for file downloads |
| `RESUME_BUILDER_URL` | `https://cv.dev.parvagas.pt` | `https://cv.parvagas.pt` | CV Builder (Reactive Resume) public URL |

### Frontend Environment Variables (Vercel)

| Variable | Dev Value | Prod Value | Purpose |
|----------|-----------|-----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | `https://api.dev.parvagas.pt` | `https://api.parvagas.pt` | Backend API endpoint (frontend calls) |
| `NEXT_PUBLIC_CV_BUILDER_URL` | `https://cv.dev.parvagas.pt` | `https://cv.parvagas.pt` | CV Builder app URL (iframe/popup) |
| `NEXT_PUBLIC_STORAGE_URL` | `https://storage.dev.parvagas.pt` | `https://storage.parvagas.pt` | Storage (MinIO) URL for file downloads |
| `NEXT_PUBLIC_APP_URL` | `https://dev-parvagas.vercel.app` | `https://parvagas.vercel.app` | Frontend app URL (for canonical URLs, etc) |

## Command Reference

### Deploy to Vercel

```bash
# Link repo to Vercel project
vercel link

# Add environment variables via CLI
vercel env add NEXT_PUBLIC_BACKEND_URL
vercel env add NEXT_PUBLIC_CV_BUILDER_URL
vercel env add NEXT_PUBLIC_STORAGE_URL
vercel env add NEXT_PUBLIC_APP_URL

# Deploy to preview
git push origin feature-branch

# Deploy to production
git push origin main
```

### Update Backend (Docker)

```bash
# Dev environment
docker compose -f docker-compose.dev.yml up -d --force-recreate backend-python

# Production environment (via Portainer or locally)
docker compose -f docker-compose.prod.yml up -d --force-recreate backend-python
```

### Test CORS

```bash
# Check if backend accepts requests from Vercel
curl -H "Origin: https://parvagas.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     https://api.parvagas.pt/health \
     -v

# Should see:
# < Access-Control-Allow-Origin: https://parvagas.vercel.app
# < Access-Control-Allow-Credentials: true
```

### Verify DNS

```bash
# Check DNS records
nslookup api.parvagas.pt
nslookup cv.parvagas.pt
nslookup storage.parvagas.pt

# Should all resolve to your server IP
```

## Configuration Checklist

### Before deploying to production:

- [ ] DNS records created for api.parvagas.pt, cv.parvagas.pt, storage.parvagas.pt
- [ ] SSL certificates provisioned (Traefik + Let's Encrypt)
- [ ] Backend FRONTEND_URL updated to Vercel production URL
- [ ] Backend CORS_ORIGIN includes both Vercel and parvagas.pt domains
- [ ] Vercel environment variables set for all NEXT_PUBLIC_* vars
- [ ] Tested API calls from Vercel frontend to backend
- [ ] Tested CORS with curl or Postman
- [ ] Email templates use correct FRONTEND_URL for links

### Before deploying frontend to Vercel:

- [ ] All NEXT_PUBLIC_BACKEND_URL calls use env var (not hardcoded)
- [ ] Error handling for backend connection timeouts
- [ ] Auth tokens properly sent in Authorization headers
- [ ] File uploads use correct S3_ENDPOINT_URL
- [ ] CV Builder iframe/popup uses correct RESUME_BUILDER_URL
- [ ] Tested all API calls in staging environment
- [ ] Disabled console.log() of sensitive data before prod deploy

## Local Development Setup

For testing Vercel + Docker setup locally:

### 1. Add hosts entries (/etc/hosts or C:\Windows\System32\drivers\etc\hosts)

```
127.0.0.1  api.dev.parvagas.pt
127.0.0.1  cv.dev.parvagas.pt
127.0.0.1  storage.dev.parvagas.pt
127.0.0.1  dev.parvagas.pt
```

### 2. Run docker-compose.dev.yml

```bash
docker compose -f docker-compose.dev.yml up
```

### 3. Run Next.js locally (simulating Vercel)

```bash
cd <frontend-dir>
NEXT_PUBLIC_BACKEND_URL=https://api.dev.parvagas.pt \
NEXT_PUBLIC_CV_BUILDER_URL=https://cv.dev.parvagas.pt \
NEXT_PUBLIC_STORAGE_URL=https://storage.dev.parvagas.pt \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
npm run dev
```

### 4. Test API calls

```typescript
// In browser console
fetch('https://api.dev.parvagas.pt/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

## Troubleshooting

### CORS Error on Frontend

```
Access to fetch at 'https://api.parvagas.pt/...' from origin 'https://parvagas.vercel.app'
has been blocked by CORS policy
```

**Solution:**
1. Check backend `FRONTEND_URL` and `CORS_ORIGIN` include the Vercel domain
2. Restart backend: `docker compose -f docker-compose.prod.yml restart backend-python`
3. Wait 30s for backend to fully start
4. Retry request

### 404 on Backend Routes

```
GET https://api.parvagas.pt/api/v1/profiles/me → 404
```

**Solution:**
1. Verify route exists: `docker compose -f docker-compose.prod.yml logs backend-python | grep -i profiles`
2. Check API docs: `https://api.parvagas.pt/api/docs` (Swagger UI)
3. Verify backend version in git tag matches expected version

### Connection Refused

```
Failed to fetch from https://api.parvagas.pt
ERR_CONNECTION_REFUSED
```

**Solution:**
1. Check DNS: `nslookup api.parvagas.pt`
2. Check Traefik: `docker logs -f proxy`
3. Check backend: `docker compose -f docker-compose.prod.yml ps`
4. Verify port 443 is open: `curl -v https://api.parvagas.pt/health`

### SSL Certificate Issues

```
ERR_SSL_PROTOCOL_ERROR
or
ERR_SSL_VERSION_OR_CIPHER_MISMATCH
```

**Solution:**
1. Check certificate: `echo | openssl s_client -servername api.parvagas.pt -connect api.parvagas.pt:443`
2. Renew Let's Encrypt: `docker exec proxy certbot renew`
3. Restart Traefik: `docker compose -f docker-compose.prod.yml restart proxy`

## Files to Keep in Sync

When making changes, update these files consistently:

| File | Purpose | Update when |
|------|---------|-----------|
| `docker-compose.dev.yml` | Dev backend config | changing API, adding services, updating domains |
| `docker-compose.prod.yml` | Prod backend config | same as above |
| `VERCEL_DOCKER_SETUP.md` | Documentation | updating env vars or architecture |
| `VERCEL_FRONTEND_INTEGRATION.md` | Frontend guide | updating API endpoints or patterns |
| `.env.example` / `.env.prod` | Backend env template | adding new config options |
| Vercel Project Settings | Frontend env vars | after updating backend config |

## Testing the Full Flow

```bash
# 1. Start local backend
docker compose -f docker-compose.dev.yml up -d

# 2. Verify Traefik routing (if using Traefik locally)
curl -H "Host: api.dev.parvagas.pt" http://localhost

# 3. Or test directly on docker compose port
curl http://localhost:8000/api/health

# 4. Start frontend locally with prod-like settings
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev

# 5. Test frontend API calls
# Open http://localhost:3000
# Open browser DevTools → Network tab
# Perform an action that calls backend
# Verify request succeeds with 200 status
```
