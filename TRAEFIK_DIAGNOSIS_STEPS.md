# Traefik Routing Fix — Step by Step

Run these **in order** on the server (SSH, or Portainer's Console on the
Traefik container). Each step tells you what to look for and what to do
depending on the result. Stop and report back at the first step that
reveals the problem — you likely won't need to run all of them.

---

## Step 1 — Find the Traefik container

```bash
docker ps --filter "name=traefik" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Note the container name — you'll need it for every command below. If
nothing shows up, Traefik itself isn't running at all, which is a bigger
problem than a missing config file; skip to **Step 6**.

For the rest of this guide, replace `TRAEFIK` with that container name, e.g.:
```bash
export TRAEFIK=$(docker ps -qf "name=traefik")
```

---

## Step 2 — Confirm the dynamic config file is actually on disk

```bash
find / -xdev -name "parvagas.yml" 2>/dev/null
cat /home/autisync/infra/traefik/dynamic/parvagas.yml 2>/dev/null || echo "NOT FOUND at expected path"
```

- **If `find` returns nothing at all** → the file was never copied onto the
  server. Fix: copy [`deploy/traefik/dynamic/parvagas.yml`](deploy/traefik/dynamic/parvagas.yml)
  from this repo onto the server at the path Traefik's file provider watches
  (find that path in Step 3), then go to **Step 5** to confirm Traefik picked
  it up.
- **If it's found but at a different path than Traefik watches** → move/copy
  it to the right path (Step 3 tells you the right path).
- **If it's found at the right path and content matches the repo** → the
  file is fine, move to **Step 4**.

---

## Step 3 — Find out what directory Traefik's file provider actually watches

```bash
docker inspect $TRAEFIK --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -i provider
docker inspect $TRAEFIK --format '{{json .Mounts}}' | python3 -m json.tool
```

The first command shows Traefik's startup flags — look for something like
`--providers.file.directory=/etc/traefik/dynamic` and
`--providers.file.watch=true`.

The second command shows what's actually mounted into the container. **The
path from the first command must correspond to a volume/bind mount in the
second command**, and that mount's host-side source is where you need to
place `parvagas.yml`.

Common mismatch: Traefik is told to watch `/etc/traefik/dynamic` inside the
container, but that maps to `/home/autisync/infra/traefik/dynamic` on the
host — if you placed the file at a different host path, it silently isn't
seen. Fix by placing the file at the correct **host** path shown by the
mount.

---

## Step 4 — Read Traefik's own logs for the real error

```bash
docker logs $TRAEFIK --tail 200 | grep -iE "error|parvagas|api\.parvagas|file provider|acme|certresolver"
```

Look for:
- `"error while parsing configuration file"` → the YAML has a syntax error
  or a field Traefik's version doesn't recognize. Post the exact error here.
- No mention of `parvagas` or `api.parvagas` **at all** → the file provider
  never loaded it (confirms Step 2/3 diagnosis — go back and fix the path).
- ACME/certresolver errors mentioning `letsencrypt` → the router loaded fine
  but cert issuance is failing (rate limit, DNS challenge misconfigured,
  port 80 blocked for HTTP-01 challenge). This is a *different*, later-stage
  problem — the routing itself would still 404, not 502, once this is the
  only remaining issue.

---

## Step 5 — Confirm the router registered (if Traefik's API is reachable)

```bash
docker exec $TRAEFIK wget -qO- http://localhost:8080/api/http/routers 2>/dev/null | python3 -m json.tool | grep -A5 parvagas-api
```

If this returns nothing, the router named `parvagas-api` (defined in
`parvagas.yml`) genuinely isn't loaded — back to Steps 2-4. If it returns a
router with `"status": "enabled"`, the config is loaded and the problem has
shifted elsewhere (check the `service` field points at a reachable backend —
Step 7).

If `wget` isn't installed in the Traefik image, try `curl` instead, or skip
this step — Step 4's logs are the more reliable signal anyway.

---

## Step 6 — If Traefik itself isn't running (from Step 1)

```bash
docker compose -f docker-compose.prod.portainer.yml ps traefik 2>/dev/null
docker compose -f docker-compose.prod.portainer.yml up -d traefik 2>/dev/null
```

Adjust the compose file path/service name to whatever your actual Traefik
service is called if it's not defined in `docker-compose.prod.portainer.yml` (it may
be a separate standalone Traefik deployment outside this repo's compose
stack — check `docker ps -a` for a stopped/crashed Traefik container and
`docker logs` on it to see why it exited).

---

## Step 7 — Confirm the network path from Traefik to the backend

Even with a loaded router, Traefik needs to reach
`http://parvagas-backend-api:8000` (the service target in `parvagas.yml`).

```bash
docker network inspect proxy --format '{{range .Containers}}{{.Name}} — {{.IPv4Address}}{{"\n"}}{{end}}'
```

Both `$TRAEFIK` and the `parvagas-backend-backend-python-1` container must
appear in this list (network name may differ if `TRAEFIK_NETWORK` is set to
something other than `proxy` in your `.env` — check with
`echo $TRAEFIK_NETWORK` or grep it from the `.env` file used by the compose
stack).

If the backend container is missing from this network, the alias
`parvagas-backend-api` won't resolve inside Traefik even with a perfectly
loaded router — re-run `docker compose -f docker-compose.prod.portainer.yml up -d
backend-python` to reattach it.

---

## Step 8 — Verify the fix from outside

Once you believe it's fixed:

```bash
curl -sI https://api.parvagas.pt/health
```

Expect `HTTP/2 200` with a JSON body (`{"status":"ok",...}`), not a 502 or
a plain-text 404. Then try logging in on the actual site.

---

Report back with the output of whichever step first shows something
wrong (most likely Step 2 or Step 4) and I'll pin down the exact one-line
fix instead of guessing further.
