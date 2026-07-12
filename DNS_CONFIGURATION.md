# DNS Configuration — Parvagas

## Current Configuration

✅ **api.parvagas.pt**
- Type: A Record
- IP: 46.224.205.82
- Status: Proxied (Cloudflare)
- TTL: Auto

---

## Required DNS Records

### Production (parvagas.pt)

| Subdomain | Type | Content | Proxied | Purpose |
|-----------|------|---------|---------|---------|
| `api.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Backend API → Traefik → :8000 |
| `cv.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | CV Builder → Traefik → :3000 |
| `storage.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | MinIO S3 → Traefik → :9000 |
| `parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Main site (if self-hosted) |

**OR use Wildcard:**
| Record | Type | Content | Proxied | Purpose |
|--------|------|---------|---------|---------|
| `*.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Catch-all for all subdomains |

### Development (dev.parvagas.pt)

| Subdomain | Type | Content | Proxied | Purpose |
|-----------|------|---------|---------|---------|
| `dev-api.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Dev Backend API |
| `dev-cv.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Dev Parvagas CV Builder |
| `dev-storage.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Dev MinIO S3 |

**OR use Wildcard:**
| Record | Type | Content | Proxied | Purpose |
|--------|------|---------|---------|---------|
| `*.dev.parvagas.pt` | A | 46.224.205.82 | ✓ Auto | Catch-all for all dev subdomains |

---

## Cloudflare Setup Steps

### 1. Add A Records for Production

In **Cloudflare Dashboard** → **DNS** → **Records**:

```
Name: api.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes (Cloudflare)
TTL: Auto
```

```
Name: cv.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes
TTL: Auto
```

```
Name: storage.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes
TTL: Auto
```

### 2. Add A Records for Development (Optional)

```
Name: dev-api.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes
TTL: Auto
```

```
Name: dev-cv.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes
TTL: Auto
```

```
Name: dev-storage.parvagas.pt
Type: A
Content: 46.224.205.82
Proxied: Yes
TTL: Auto
```

### 3. Enable Cloudflare SSL/TLS

- Go to **SSL/TLS** → **Overview**
- Set to **Full (strict)** for production
- This ensures HTTPS works with Let's Encrypt on your server

### 4. Enable CORS Headers (if needed)

- Go to **Rules** → **Transform Rules** → **Modify Response Header**
- Add `Access-Control-Allow-Origin` headers (optional, backend already handles this)

### 5. Enable Page Rules (Optional)

- Go to **Rules** → **Page Rules**
- Cache everything: `https://storage.parvagas.pt/*`
- Disable cache: `https://api.parvagas.pt/*` (to avoid stale API responses)

---

## Verification

After creating DNS records, verify they're working:

### 1. Check DNS Resolution

```bash
# Linux / macOS
nslookup api.parvagas.pt
nslookup cv.parvagas.pt
nslookup storage.parvagas.pt

# Windows PowerShell
Resolve-DnsName api.parvagas.pt
Resolve-DnsName cv.parvagas.pt
Resolve-DnsName storage.parvagas.pt
```

Should return: **46.224.205.82**

### 2. Check HTTPS Connection

```bash
# Test API
curl -I https://api.parvagas.pt/api/health

# Test CV Builder
curl -I https://cv.parvagas.pt

# Test Storage
curl -I https://storage.parvagas.pt

# Should all return HTTP 200 or 307 (redirect)
```

### 3. Check SSL Certificate

```bash
# macOS / Linux
echo | openssl s_client -servername api.parvagas.pt -connect api.parvagas.pt:443

# Windows (Git Bash)
openssl s_client -servername api.parvagas.pt -connect api.parvagas.pt:443 < /dev/null

# Should show: Verify return code: 0 (ok)
```

### 4. Test from Frontend

```bash
# From browser console (on parvagas.vercel.app)
fetch('https://api.parvagas.pt/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(e => console.error('CORS or connection error:', e))
```

---

## Cloudflare vs Direct DNS

### Using Cloudflare (✓ Recommended)

**Pros:**
- DDoS protection included
- Automatic SSL/TLS certificates
- CDN caching for static assets
- Analytics and monitoring
- Free tier available

**Cons:**
- Additional DNS lookup layer (minimal latency)
- Let's Encrypt on server + Cloudflare SSL (double encryption)

**Setup:** Point `parvagas.pt` nameservers to Cloudflare, then add A records

### Using Direct DNS (e.g., Namecheap, GoDaddy)

**Pros:**
- Direct control, minimal latency
- Simpler setup for single server

**Cons:**
- No DDoS protection
- Manual SSL certificates required
- No CDN

**Setup:** Add A records directly at your registrar pointing to 46.224.205.82

---

## Important: SSL Certificate Configuration

### If using Cloudflare with Let's Encrypt (Recommended)

1. **Cloudflare SSL/TLS** → Set to **Full (strict)**
2. **Server (Let's Encrypt)** → Traefik will auto-provision certificates for:
   - api.parvagas.pt
   - cv.parvagas.pt
   - storage.parvagas.pt

3. **Traffic Flow:**
   ```
   Browser (HTTPS)
        ↓ (Cloudflare)
   Your Server (HTTPS)
        ↓ (Traefik)
   Backend Services
   ```

### Traefik Configuration (Already Set)

In `docker-compose.prod.yml`:

```yaml
traefik:
  labels:
    traefik.http.entrypoints.websecure.http.tls.certresolver: letsencrypt
    traefik.http.entrypoints.websecure.http.tls.domains[0].main: parvagas.pt
    traefik.http.entrypoints.websecure.http.tls.domains[0].sans: "*.parvagas.pt,*.dev.parvagas.pt"
```

This tells Let's Encrypt to provision certificates for:
- `*.parvagas.pt` (all production subdomains)
- `*.dev.parvagas.pt` (all dev subdomains)

---

## Troubleshooting DNS Issues

### DNS not resolving

```bash
# Clear DNS cache
# Windows
ipconfig /flushdns

# macOS
sudo dscacheutil -flushcache

# Linux
sudo systemctl restart systemd-resolved
```

### "Too many redirects" error

This usually means:
1. Cloudflare SSL setting is wrong (should be "Full (strict)")
2. Traefik is redirecting HTTP → HTTPS
3. Check: `curl -I http://api.parvagas.pt` (should redirect to HTTPS)

### CORS error from Vercel

If you get CORS errors:
1. Verify backend `FRONTEND_URL=https://parvagas.vercel.app`
2. Verify `CORS_ORIGIN` includes Vercel domain
3. Check backend logs: `docker logs -f backend-python`

### 502 Bad Gateway

This means:
1. Traefik can't reach backend service
2. Check: `docker compose -f docker-compose.prod.yml ps`
3. Restart: `docker compose -f docker-compose.prod.yml restart backend-python`

---

## Summary Checklist

- [ ] `api.parvagas.pt` → 46.224.205.82 (✓ Already done)
- [ ] `cv.parvagas.pt` → 46.224.205.82 (Create in Cloudflare)
- [ ] `storage.parvagas.pt` → 46.224.205.82 (Create in Cloudflare)
- [ ] `api.dev.parvagas.pt` → 46.224.205.82 (Create in Cloudflare)
- [ ] `cv.dev.parvagas.pt` → 46.224.205.82 (Create in Cloudflare)
- [ ] `storage.dev.parvagas.pt` → 46.224.205.82 (Create in Cloudflare)
- [ ] Cloudflare SSL/TLS → Full (strict)
- [ ] Traefik certificates auto-provisioned
- [ ] Test DNS resolution
- [ ] Test HTTPS connections
- [ ] Test CORS from Vercel frontend
