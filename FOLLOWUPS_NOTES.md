# Security Follow-ups — Execution Notes

Branch: `security-followups`, branched off `launch-audit-fixes` (which itself
branches off `main`, with `staging`'s commits already merged in). Source plan:
`SONNET_PLAN_SECURITY_FOLLOWUPS.md`, driven by `LAUNCH_READINESS_REPORT.md` §5.

One commit per task, all green. Nothing was reverted — every task passed its
verification gate on the first or second attempt.

```
e0694a6 chore: bump httpx 0.25.2 -> 0.28.1
ed32edd chore: Pydantic v3-proofing — class Config -> model_config = ConfigDict()
ff1da77 security: reCAPTCHA site key fails loudly instead of a hardcoded fallback
6078579 security: remove unsafe-eval from CSP script-src
e156ac4 security: drop root from prod/dev containers, fix volume ownership properly
c12b6d5 security: migrate python-jose to PyJWT, removing the unfixable ecdsa CVE
f6d2e2b docs: add launch readiness audit report and follow-up plan
```

## Task-by-task status

### Task 1 — python-jose → PyJWT — **DONE**
- `app/core/security.py` (HS256) and `app/core/auth.py` (Auth0 RS256/JWKS)
  both swapped to PyJWT. `python-jose`/`ecdsa`/`pyasn1`/`rsa` uninstalled
  from the environment and the app still imports and runs the full suite
  clean — proves nothing else in the tree needed them.
- Auth0 path: signature verification now goes through PyJWT's
  `PyJWKClient` + `jwt.decode(..., algorithms=["RS256"])` with every
  claim-check option disabled (signature-only); `_validate_auth0_claims`
  is untouched, so the custom exp/iss/aud messages and the conditional
  audience check (only enforced when `AUTH0_AUDIENCE` is set) behave
  exactly as before. JWKS caching now relies on `PyJWKClient`'s own
  cache (`cache_jwk_set=True, lifespan=300`) instead of a hand-rolled dict
  — same TTL.
- New tests: an HS256 cross-library interop test (hand-built via stdlib
  `hmac`/`hashlib`, since jose is no longer installed to generate a
  comparison token) plus 9 new tests covering the Auth0/JWKS path end to
  end (valid, tampered, wrong signing key, expired, wrong issuer, wrong
  audience, audience-as-list, audience-check-skipped-when-unconfigured,
  unknown kid) — **this path had zero prior test coverage**, so these are
  net-new. A local RSA keypair stands in for Auth0's key; `_get_jwks_client`
  is stubbed, no real network call.
- One bug caught by the full-suite run (not the new test file in
  isolation): the Auth0 test fixture reassigned the module-level
  `auth_module.settings` global and didn't restore it, leaking
  `AUTH_PROVIDER=auth0` into later tests (`test_rate_limit_key.py` failed).
  Fixed by capturing and restoring the original object in teardown.

### Task 2 — Drop root from prod/dev containers — **DONE (needs Rex's Docker validation)**
- Removed `user: "0:0"` from all 5 prod services (`backend-python`,
  `websocket-service`, `celery-worker`, `celery-worker-scraper`,
  `celery-beat`) and both dev services (`backend-python`, `celery-worker`).
- Root cause of why it was there: `/app/logs` was never created in the
  Dockerfile (only `/app/uploads` was) — a Docker-created named volume with
  no image-side directory to inherit ownership from comes up root-owned,
  which the non-root `appuser` (uid 1000) can't write to. Fixed at the
  image level (Dockerfile now creates + chowns both dirs) **and** added a
  one-shot `volume-permissions-init` service (same `restart: "no"` pattern
  as the existing `minio-init`) that unconditionally chowns both named
  volumes to `1000:1000` on every start — this matters because these
  volumes have been running under root for a while, so any existing
  content in them is almost certainly root-owned already; removing
  `user: "0:0"` without this would crash the app on its first write.
- `backend-python` and `celery-worker` (the only services that mount these
  volumes) now `depends_on: volume-permissions-init:
  condition: service_completed_successfully`.
- **Docker isn't available in this sandbox** — validated via `python3 -c
  "import yaml; yaml.safe_load(...)"` (both compose files parse, structure
  confirmed correct via inspection) and the unaffected backend pytest
  suite (still green). **Not build-tested with real Docker.**

  **Rex: please run before trusting this in production:**
  ```bash
  docker compose -f docker-compose.prod.yml up -d --build
  docker exec parvagas-backend-api id -u        # expect: 1000
  docker exec parvagas-backend-api id -u -n parvagas-celery-worker  # or equivalent for that container
  # Upload smoke test: hit an endpoint that writes to /app/uploads (e.g. quick-apply CV upload)
  # and confirm it succeeds, then:
  curl -f https://api.parvagas.pt/health
  ```
  Do this for the dev stack too (`docker-compose.dev.yml`,
  `dev-api.parvagas.pt`) since that's the one you just redeployed for the
  migration fix and is presumably still running under the old root config.

### Task 3 — Remove `unsafe-eval` from CSP — **DONE**
- `next.config.mjs`: removed `'unsafe-eval'` from `script-src` only;
  `'unsafe-inline'` stays (Next hydration + reCAPTCHA need it).
- Checked `@material-tailwind/react` (no eval/Function usage) and
  `lottie-web` (does call `eval()`, but only when an animation JSON
  defines an After-Effects expression — verified directly that none of
  the 3 files in `public/lottie/` contain one, so that path is dead for
  everything this app actually ships).
- Verified live: `npm run build && npm start` (added a `web-prod` launch
  config since the existing `web` one runs `next dev`, whose own HMR
  tooling needs `unsafe-eval` independent of the app's CSP — testing
  against dev would have been testing the wrong thing). Zero CSP
  violations in the console on landing, job listing, and login/reCAPTCHA.

  **Rex: the pages that render Lottie animations are all auth-gated**
  (`Portal/Candidato/{Candidaturas,Vagas-Guardadas,Dashboard,
  Construtor-CV,Vagas-Recomendadas,Vagas-Disponiveis}`) — I didn't have a
  seeded account to test them live. Static analysis above already covers
  why they're safe, but a one-click sanity check (open DevTools console,
  visit one, confirm no CSP violation) would close the loop.

### Task 4 — reCAPTCHA site key fails loudly — **DONE**
- Two hardcoded fallback copies of the real production site key existed
  (`src/app/layout.tsx` and `src/lib/recaptcha.ts`) — both removed. When
  `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is unset, the script tag is skipped
  entirely (`console.error` logged server-side, shows up in build/deploy
  logs) instead of silently reusing the baked-in key.
- `.env.example` had the *real* key as its "example" value — changed to
  an empty placeholder.
- **The actual gap**: neither `.env.vercel-prod` nor `.env.vercel-dev`
  listed this var at all. Added to both as `<from-recaptcha-admin-console>`
  — **Rex, you need to confirm the real value is actually set in the
  Vercel dashboard for both environments**, or production will now run
  with captcha silently disabled instead of silently using the old
  hardcoded key. This is the one place this task could make things worse
  instead of better if the dashboard config doesn't already have it.
- Also added the "PUBLIC values + placeholders ONLY" header to both
  `.env.vercel-*` files per LOW #6, and the `~/Downloads` cloud-sync
  warning to README's `## Setup local` section per MEDIUM #4 (both listed
  as "not for Sonnet" but explicitly asked for a small Sonnet-side
  addition in each case).
- Verified live by toggling `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in the local
  `.env` (never committed) and confirming via a headless browser check
  that `window.grecaptcha` and the script tag are present exactly when
  set, absent exactly when unset, with the `console.error` line appearing
  in `npm run build` output in the unset case.

### Task 5 — Pydantic v3-proofing — **DONE**
- All 9 `class Config: from_attributes = True` blocks in
  `app/schemas/__init__.py` swapped to `model_config =
  ConfigDict(from_attributes=True)` (mechanical — all 9 were identical).
- Grepped the whole `app/` tree for `@validator`, `.dict()`, `.json()` on
  Pydantic models — **none found**. Every `.json()` call in the codebase
  is on an httpx/requests HTTP response object, unrelated to Pydantic's
  deprecated `BaseModel.json()`.
- Verified: `pytest -W error::pydantic.PydanticDeprecatedSince20` → zero
  errors (would have flagged all 9 before the fix).
- **Noted, not fixed** (out of scope for this task): the same run surfaced
  `datetime.datetime.utcnow()` deprecation warnings (stdlib, not
  Pydantic) in `app/api/v1/auth.py:42` and several test files
  (`test_verification_backfill.py`, `test_verification_resend_cooldown.py`).
  Worth a dedicated pass swapping to `datetime.now(datetime.UTC)`, but
  that's a different deprecation than what this task targeted.

### Task 6 — httpx bump — **DONE**
- `0.25.2` → `0.28.1` (latest as of this run). Checked every call site
  (9 files) against 0.28's breaking changes (removed `proxies=` kwarg,
  removed `app=` ASGI shortcut) — none present anywhere in the codebase.
- Full suite green, including `test_conditional_get.py`,
  `test_hibp_service.py`, `test_llm_service*.py`,
  `test_url_scheme_safety.py`, `test_scraper_portal_adapters.py`
  explicitly — all of these stub `httpx.get`/`httpx.Client` directly
  rather than hitting real network, so the bump doesn't touch what they
  exercise. (The plan's ground rules called out `test_conditional_get.py`
  as an expected environment-limited DNS failure — it passed cleanly here,
  better than expected, no action needed.)

## Final verification (this run)

```
$ cd backend-python && python3 -m pytest -q -p no:warnings
708 passed, 3 skipped in 67.09s
# 3 skips = tests/test_auto_apply_llm_golden.py, needs a live LLM (RUN_LLM_GOLDEN_TESTS=1)

$ npm run build
✓ build succeeded, all routes compiled (static + dynamic)

$ npm test
Test Files  12 passed (12)
Tests  112 passed (112)
```

No reverts. No environment-limited failures beyond the 3 pre-declared LLM
golden skips.

## Rex's manual checklist

1. **Docker validation (Task 2)** — **CONFIRMED 2026-07-24**: Rex redeployed
   the stack. (The specific smoke-test commands listed under Task 2 above —
   `id -u` inside the container, the uploads write test, the `/health`
   curl — weren't re-run by the assistant; worth a quick manual glance if
   you haven't already eyeballed the container logs post-deploy.)
2. **Lottie/CSP sanity check (Task 3)** — log into the candidate portal,
   open DevTools console, visit any page with an empty-state/success/
   milestone animation, confirm zero CSP violations. Still open.
3. **reCAPTCHA env var (Task 4)** — **CONFIRMED 2026-07-24**:
   `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is set in the Vercel dashboard; stack
   redeployed.
4. Not done here, per the plan (your items):
   - **MEDIUM #4** — actually moving the project out of `~/Downloads`
     (README warning added, but the move itself is on you).
   - **LOW #6** — deciding whether `.env.vercel-*` should even stay
     tracked in git at all (header comment added as the minimal ask).
