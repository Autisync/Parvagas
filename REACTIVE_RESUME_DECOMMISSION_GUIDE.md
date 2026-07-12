# Decommissioning Reactive Resume (cv.parvagas.pt) — step-by-step

## Why this exists

`EXECUTION_PLAN_NATIVE_CV_BUILDER.md`'s Phase A (A1-A6, all shipped and
committed) replaced the embedded Reactive Resume CV builder with a fully
native one inside the portal (`/Portal/Candidato/Construtor-CV`). As of A5,
nothing in the frontend links to `cv.parvagas.pt` or mints an SSO
handoff/authorization code anymore — the OIDC bridge in
`backend-python/app/api/v1/resume_sso.py` (`/oauth/authorize`, `/oauth/token`,
`/oauth/userinfo`, `/.well-known/openid-configuration`) has zero live callers.

**This guide's three steps were deliberately NOT executed automatically.**
Retiring `cv-builder` is a one-way move for real users still mid-CV over
there, and the sandbox that built the native replacement has no way to
authenticate past `/Login` — it could verify the code compiles and the
routes respond, but never watched a real candidate create/edit/export a CV
against a live backend. **Do not run these steps until you've personally
walked through [`MANUAL_TEST_GUIDE.md`](MANUAL_TEST_GUIDE.md)'s §11
"Construtor de CV nativo" against production (or staging) and it all
worked.** Once that's confirmed, this doc is the exact sequence.

## What's safe to remove vs. what must stay

- **Remove**: the `cv-builder` service block in `docker-compose.prod.yml`
  and its `OAUTH_*`/token-secret env vars. This is Reactive Resume itself —
  nothing else depends on this container.
- **Keep**: `ollama` — it's shared infrastructure for the backend's own LLM
  features (`OLLAMA_BASE_URL`/`OLLAMA_MODEL` in `docker-compose.prod.yml`,
  used by `resume_ai_service.py` etc.), not something Reactive Resume owns.
  Nothing in this decommission touches it.
- **Keep for one more release**: `resume_sso.py`'s OIDC routes and their
  `SSOHandoffCode`/`OAuthAuthorizationCode` tables. Per the execution plan's
  own A7 checklist, these stay dark for one release cycle after the native
  builder is confirmed live — cheap insurance in case something in
  production still has an old bookmark or cached link pointing at the OIDC
  flow. `guest_start` (now JWT-based since A5) is unaffected either way.

## Step 1 — Confirm Phase A works live

Walk `MANUAL_TEST_GUIDE.md` §11 end to end on the real deployed backend:
pre-fill from profile, autosave, live preview (desktop + mobile sheet),
experience/education modals, PDF/DOCX/JSON export, duplicate/delete, and
the full guest journey (new account + revisit-same-email). If anything
fails, fix it and re-verify before touching anything below.

## Step 2 — Traefik: point cv.parvagas.pt at the native route

Add a redirect router to `deploy/traefik/dynamic/parvagas.yml` (same file
`TRAEFIK_FIX_GUIDE.md` documents deploying) — a `redirectregex` middleware
sending every `cv.parvagas.pt/*` request to
`https://parvagas.pt/Portal/Candidato/Construtor-CV`, so old bookmarks and
any indexed links keep working instead of 404ing once the container is gone:

```yaml
# add under http.middlewares:
    cv-to-native-redirect:
      redirectRegex:
        regex: "^https://cv\\.parvagas\\.pt/.*"
        replacement: "https://parvagas.pt/Portal/Candidato/Construtor-CV"
        permanent: true

# change the existing parvagas-cv router to use it instead of forwarding
# to the cv-builder service:
    parvagas-cv:
      rule: "Host(`cv.parvagas.pt`)"
      entryPoints: [websecure]
      middlewares: [cv-to-native-redirect]
      service: parvagas-cv          # service block can stay; middleware short-circuits before it's reached
      tls:
        certResolver: letsencrypt
```

Deploy the same way `TRAEFIK_FIX_GUIDE.md` describes: `scp` the updated file
to `/home/autisync/infra/traefik/dynamic/parvagas.yml` on the server,
Traefik hot-reloads it (`watch: true`, no restart needed). Verify:

```bash
curl -sI https://cv.parvagas.pt/anything
# Expect: HTTP/2 301, location: https://parvagas.pt/Portal/Candidato/Construtor-CV
```

This step is reversible independently of Step 3 — you can ship the redirect
and leave the `cv-builder` container running for a few days as a safety net
before removing it in Step 3.

## Step 3 — Remove the cv-builder service from docker-compose.prod.yml

Delete the entire `cv-builder:` service block (currently lines ~318-386 —
confirm the exact range in your checkout, since other edits may have shifted
it) including its `depends_on`/`networks`/`labels`/`healthcheck`. Also
remove these now-orphaned env vars if nothing else references them (grep
first — `RESUME_BUILDER_SECRET` and `RESUME_SSO_CLIENT_ID` are also read by
`backend-python`'s `resume_sso.py`, so leave those two until the OIDC routes
themselves are removed; only drop compose-local ones like
`RESUME_BUILDER_REFRESH_SECRET` if truly unused elsewhere).

Redeploy via Portainer (pull latest `docker-compose.prod.yml`, redeploy the
stack) — this stops and removes the `cv-builder` container. Verify:

```bash
docker ps | grep parvagas-cv   # should return nothing
curl -sI https://cv.parvagas.pt/anything  # still 301s (Traefik redirect from Step 2, independent of the container)
```

## Step 4 — One release later: remove the OIDC bridge itself (separate commit)

Once Step 3 has been live for a full release cycle with no issues, remove
in one clean commit:
- `backend-python/app/api/v1/resume_sso.py`'s `/oauth/authorize`,
  `/oauth/token`, `/oauth/userinfo`, `/.well-known/openid-configuration`
  routes and the `create_handoff_code` endpoint (`guest_start` stays — it's
  JWT-based since A5, unrelated to OIDC).
- `SSOHandoffCode`/`OAuthAuthorizationCode` models + a migration dropping
  their tables.
- `RESUME_SSO_CLIENT_ID`/`RESUME_SSO_REDIRECT_URI` from
  `backend-python/app/core/config.py`.
- `src/lib/resumeBuilder.ts` (already unreferenced by any frontend code
  since A5 — safe to delete outright).
- `backend-python/tests/test_resume_sso.py` (the guest-flow tests in
  `test_resume_sso_guest.py` stay; only the OIDC-bridge tests go).

## Rollback

- Step 2 (Traefik): restore the previous `parvagas.yml` from the
  `.bak-<timestamp>` file the way `TRAEFIK_FIX_GUIDE.md` describes.
- Step 3 (compose): re-add the `cv-builder` service block from git history
  (`git show <commit>:docker-compose.prod.yml`) and redeploy — the image
  (`amruthpillai/reactive-resume:v5.2.3`) is unchanged and still pullable,
  so the container comes back exactly as it was.
- Step 4: this is why it's a separate, later commit — reverting it doesn't
  touch anything from Steps 1-3.
