# Decommissioning Reactive Resume (cv.parvagas.pt) — step-by-step

## Status: code-side cleanup done. Server deploy is the only remaining step.

`EXECUTION_PLAN_NATIVE_CV_BUILDER.md`'s Phase A (A1-A7) replaced the
embedded Reactive Resume CV builder with a fully native one inside the
portal (`/Portal/Candidato/Construtor-CV`). The CV builder is not a
separate app or subdomain — it's part of the main system, served by the
same backend-api container as everything else.

All of the **code** changes below are already committed to `staging`:
- `resume_sso.py`'s OIDC bridge (`/oauth/authorize`, `/oauth/token`,
  `/oauth/userinfo`, `/.well-known/openid-configuration`, and the
  `POST /resume-sso/handoff` code-minting endpoint) is deleted. `guest_start`
  (JWT-based, unrelated to that bridge) is the only thing left in the file.
- `SSOHandoffCode`/`OAuthAuthorizationCode` models are deleted; migration
  `20260713_0033` drops their tables.
- `RESUME_BUILDER_URL`/`RESUME_BUILDER_SECRET`/`RESUME_SSO_CLIENT_ID`/
  `RESUME_SSO_REDIRECT_URI` are deleted from `config.py` (nothing reads them
  anymore).
- `src/lib/resumeBuilder.ts` is deleted (was already unreferenced since A5).
- The `cv-builder` service is deleted from `docker-compose.prod.yml`,
  `docker-compose.dev.yml`, and `docker-compose.yml` (including the local
  one that built from the `./reactive-resume` gitlink — the original source
  of this whole session's first production incident).
- `deploy/traefik/dynamic/parvagas.yml`'s `parvagas-cv`/`dev-parvagas-cv`
  routers now 301-redirect to the native route
  (`/Portal/Candidato/Construtor-CV`) via a `redirectRegex` middleware,
  instead of proxying to a container that no longer exists.
- `test_resume_sso.py` (OIDC-bridge tests) is deleted; `test_resume_sso_
  guest.py` (guest_start tests) stays and still passes.

Full verification after this cleanup: pytest 293 passed/3 skipped
(15 fewer than before — the deleted OIDC tests — everything else
unaffected), migration chain still single-head, tsc clean, vitest 91,
browser check clean.

## What's left — the live server, which this sandbox cannot touch

The **only** remaining step is deploying these changes to the real
infrastructure. This requires SSH/Portainer access this sandbox doesn't
have, so it must be done manually:

### 1. Deploy the updated Traefik config

```bash
# from your machine, on the branch with these changes
sudo cp /home/autisync/infra/traefik/dynamic/parvagas.yml \
        /home/autisync/infra/traefik/dynamic/parvagas.yml.bak-$(date +%Y%m%d-%H%M)
scp deploy/traefik/dynamic/parvagas.yml \
    <your-ssh-user>@<server>:/tmp/parvagas.yml
# then on the server:
sudo mv /tmp/parvagas.yml /home/autisync/infra/traefik/dynamic/parvagas.yml
sudo chown 1000:1000 /home/autisync/infra/traefik/dynamic/parvagas.yml
```

Traefik hot-reloads it (`watch: true`, no restart needed). Verify:

```bash
curl -sI https://cv.parvagas.pt/anything
# Expect: HTTP/2 301, location: https://parvagas.pt/Portal/Candidato/Construtor-CV
```

### 2. Redeploy the backend stack via Portainer

Pull this branch, redeploy `docker-compose.prod.yml` — this runs migration
`20260713_0033` (drops the two OIDC tables) and stops/removes the
`cv-builder` container in the same deploy. Verify:

```bash
docker ps | grep parvagas-cv   # should return nothing
curl -sI https://cv.parvagas.pt/anything  # still 301s (Traefik, independent of the container)
curl -sI https://parvagas.pt/Portal/Candidato/Construtor-CV  # your normal app, 200
```

### 3. Sanity-check the native builder live

Walk `MANUAL_TEST_GUIDE.md`'s §11 "Construtor de CV nativo" end to end
against production: pre-fill from profile, autosave, live preview,
experience/education modals, PDF/DOCX/JSON export, duplicate/delete, the
full guest journey (new account + revisit-same-email no-duplicate check),
and the D1 apply-with-a-chosen-CV flow.

## Rollback

- Traefik: restore the previous `parvagas.yml` from the `.bak-<timestamp>`
  file — hot-reloads within seconds.
- Compose/migration: `git revert` this branch's commits and redeploy —
  migration `20260713_0033`'s `downgrade()` recreates both dropped tables
  if you need to roll all the way back (you won't; nothing in production
  ever read them once `CANDIDATE_PREMIUM_ENABLED`-style dark-release safety
  applied — these tables were unused in prod already).
