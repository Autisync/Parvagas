# Traefik Fix — api.parvagas.pt 502 (step-by-step)

## What was wrong (recap)

The deployed `/home/autisync/infra/traefik/dynamic/parvagas.yml` had:

1. **Three wrong backend hostnames** — it pointed at `parvagas-backend-python`,
   `parvagas-websocket-service` and `parvagas-minio`, but the containers'
   actual aliases on the `proxy` network (from `docker-compose.prod.portainer.yml`) are
   `parvagas-backend-api`, `parvagas-websocket` and `parvagas-storage`.
   Traefik couldn't resolve the names → 502 on every request.
2. **A `strip-api-prefix` middleware** that removes `/api` before forwarding.
   FastAPI mounts its routes at `/api/v1/*` itself, so even with the hostname
   fixed, the backend would have received `/v1/auth/login` and returned 404.
3. **`PathPrefix(/api)` scoping** on the api router, which would leave
   `/health` and `/ready` unreachable through the domain.

The corrected file is in this repo at `deploy/traefik/dynamic/parvagas.yml`.

## Why this is safe for everything else Traefik serves

- **Per-file isolation.** Traefik's file provider loads every `*.yml` in
  `/dynamic` independently. `mailcow.yml`, `portainer.yml`, `dashboard.yml`,
  `smaartspend.yml`, `supabase.yml`, `vizinhoalert.yml` and `middlewares.yml`
  are separate files — replacing `parvagas.yml` cannot touch their routers.
  Even a syntax error in `parvagas.yml` would only invalidate *that file*
  (Traefik logs the error and keeps serving everything else).
- **Let's Encrypt untouched.** The `letsencrypt` certResolver is defined in
  the STATIC config (`/traefik.yml`, with the Cloudflare DNS token) — this
  fix only *references* it, exactly like the old file did. Existing certs
  and renewals for mail/portainer/etc. are unaffected.
- **The removed middleware is private to this file.** `strip-api-prefix` was
  defined inside `parvagas.yml` and referenced only by the two parvagas api
  routers. Nothing in `middlewares.yml` or any other file uses it.
- **No restart needed.** Traefik watches `/dynamic` (`watch: true`) and
  hot-reloads on save — zero downtime for any other service.

## Steps (run on the server host via SSH — not inside the container)

### 1. Back up the current file

```bash
sudo cp /home/autisync/infra/traefik/dynamic/parvagas.yml \
        /home/autisync/infra/traefik/dynamic/parvagas.yml.bak-$(date +%Y%m%d-%H%M)
```

> Note: backup files ending in `.bak-...` are ignored by Traefik (it only
> loads `.yml`/`.yaml`/`.toml`), so leaving them in the folder is fine —
> the existing `.bak.2026-01-26-2027` files there confirm this pattern.

### 2. Replace the file's contents

On your machine, from the repo (branch `main`, latest):

```bash
scp deploy/traefik/dynamic/parvagas.yml \
    <your-ssh-user>@<server>:/tmp/parvagas.yml
```

Then on the server:

```bash
sudo mv /tmp/parvagas.yml /home/autisync/infra/traefik/dynamic/parvagas.yml
sudo chown 1000:1000 /home/autisync/infra/traefik/dynamic/parvagas.yml
```

(Or simply `sudo nano` the file and paste the repo version — same result.
The chown matches the other files in that folder; Traefik reads the mount
read-only so ownership isn't strictly required, but keeps things tidy.)

### 3. Confirm Traefik hot-reloaded it cleanly

```bash
docker logs traefik --since 2m 2>&1 | grep -iE "error|parvagas"
```

- **No output, or no lines mentioning an error** → loaded cleanly.
- Any `"error while parsing"` line → paste it back to me; restore the
  backup meanwhile (`sudo cp` it back) and nothing is worse than before.

### 4. Sanity-check the OTHER services still route (the isolation proof)

```bash
curl -s -o /dev/null -w "mail:      %{http_code}\n" https://mail.ehdesigntech.co.uk
curl -s -o /dev/null -w "portainer: %{http_code}\n" https://portainer.ehdesigntech.co.uk
```

Both should return the same codes they did before (200/30x). These are
served from different dynamic files, so they should be completely
unaffected — this step just proves it.

### 5. Verify the Parvagas API is now reachable

```bash
curl -sI https://api.parvagas.pt/health
```

Expected: `HTTP/2 200` and JSON `{"status":"ok",...}` — the first time this
domain has ever answered correctly. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  https://api.parvagas.pt/api/v1/auth/login \
  -H "Origin: https://www.parvagas.pt" \
  -H "Access-Control-Request-Method: POST"
```

Expected: `200` (CORS preflight OK), not 502.

> First-request caveat: if Traefik needs to issue a NEW Let's Encrypt cert
> for `api.parvagas.pt` (likely, since the router never worked before), the
> very first HTTPS request may take a few seconds or show a temporary
> "TRAEFIK DEFAULT CERT" warning while the DNS-01 challenge completes via
> the Cloudflare token. Give it ~30–60s and retry. Cert issuance for this
> domain cannot interfere with the other domains' existing certs.

### 6. Test the real login

Open https://www.parvagas.pt/Admin/Login (and the public login) in a
browser and sign in. The "Não foi possível ligar-se ao serviço" error should
be gone. If the API responds but login still fails, that's now an
application-level error (check the response body in DevTools → Network) —
report back what it says.

### 7. Also verify cv/storage while you're at it

```bash
curl -s -o /dev/null -w "cv:      %{http_code}\n" https://cv.parvagas.pt
curl -s -o /dev/null -w "storage: %{http_code}\n" https://storage.parvagas.pt/minio/health/live
```

`cv` should return 200 once the cv-builder container is up (after the
prebuilt-image fix from earlier); `storage` should return 200 from MinIO.
502 on either means that specific container is down/not on the `proxy`
network — a container problem, not a Traefik one.

## Rollback (if anything looks wrong)

```bash
sudo cp /home/autisync/infra/traefik/dynamic/parvagas.yml.bak-<timestamp> \
        /home/autisync/infra/traefik/dynamic/parvagas.yml
```

Traefik hot-reloads the restored version within seconds. Since the old
version 502'd everything parvagas anyway, rollback can't make Parvagas worse
— and other services never depended on this file in the first place.
