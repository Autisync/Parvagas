# Execution Plan — Security Follow-ups (post-launch hardening)

Plan for a Claude (Sonnet) session with this repo mounted + shell access. Source: LAUNCH_READINESS_REPORT.md §5 (audit of 2026-07-19). Work through tasks in order — they are sequenced so an interruption still leaves the repo consistent.

## Ground rules

1. Branch off the current default branch: `git checkout -b security-followups`. One commit per task, message prefixed `security:` or `chore:`. Never touch `main`/`staging` directly. Never force-push.
2. **Verification gate after every task:** `cd backend-python && python -m pytest -q` (backend tasks) or `npm run build && npm test` (frontend tasks). A task is only done when green. If a task cannot pass, revert its changes (`git checkout -- <files>`), record why in FOLLOWUPS_NOTES.md, and move on — never leave the branch red.
3. Never print secret values. Refer to env vars by name only.
4. Known environment-limited test failures that are NOT regressions (verified in the prior audit): `tests/test_conditional_get.py` (6 tests, sandbox DNS) and `test_render_pdf_raises_runtime_error_when_native_libs_unavailable` (sandbox has pango). Everything else failing = your regression.

---

## Task 1 — Migrate python-jose → PyJWT (MEDIUM #1, kills unfixable ecdsa CVE)

**Why:** python-jose drags in `ecdsa 0.19.2` (PYSEC-2026-1325, Minerva timing attack, no fixed release). The app uses HS256 + Auth0 RS256/JWKS; PyJWT covers both and is actively maintained.

**Files:** `backend-python/app/core/security.py` (HS256 encode/decode), `backend-python/app/core/auth.py` (Auth0 JWKS path: `from jose import JWTError, jwk, jwt` + `base64url_decode`), `backend-python/requirements.txt`.

**Steps:**
1. Read both files fully first. Map every jose call: `jwt.encode`, `jwt.decode`, `JWTError`, `jwk.construct(...).verify(...)`.
2. In requirements.txt: remove `python-jose[cryptography]==3.4.0`, add `PyJWT[crypto]==2.10.1`.
3. `security.py`: swap to `import jwt` / `jwt.encode(claims, secret, algorithm="HS256")` / `jwt.decode(token, secret, algorithms=["HS256"])`. Replace `JWTError` with `jwt.PyJWTError`. Preserve existing behavior exactly — check whether current decode disables `aud`/`iss` validation and mirror it (`options={"verify_aud": False}` if claims contain no `aud`).
4. `auth.py` (Auth0/JWKS): replace manual `jwk.construct` + `base64url_decode` verification with `jwt.PyJWKClient(jwks_url).get_signing_key_from_jwt(token)` + `jwt.decode(..., algorithms=["RS256"], audience=AUTH0_AUDIENCE, issuer=AUTH0_ISSUER)`. Keep the existing JWKS cache TTL semantics or rely on PyJWKClient's built-in cache — document choice in the commit message.
5. `pip install -r requirements.txt` then confirm `pip show ecdsa python-jose` → both should be absent from the dependency tree (`pip uninstall python-jose ecdsa` if left over, then re-run tests to prove nothing imports them).
6. **Verify:** full pytest; additionally an explicit round-trip: create token via login endpoint helper, decode it, tamper one byte → must raise. Confirm a token issued with the OLD library decodes with the new one (same secret/alg — it must; HS256 is implementation-independent).

**Risk note:** auth is the most sensitive surface in the app. If any ambiguity arises (custom claim handling, leeway, `iat` revocation interplay with `tokens_revoked_at`), stop and report rather than guess.

## Task 2 — Drop root from prod containers (MEDIUM #2)

**Why:** five services in `docker-compose.prod.yml` override to `user: "0:0"` even though `backend-python/Dockerfile` already creates `appuser` (uid 1000) and sets `USER appuser`. The override was almost certainly a workaround for volume-mount permissions (uploads dir).

**Steps:**
1. Inspect each `user: "0:0"` service in `docker-compose.prod.yml` (and check `docker-compose.dev.yml` for parity): note its volumes.
2. Remove the `user: "0:0"` lines. For each writable volume (e.g. uploads), fix ownership instead: either a one-shot init service (`user: "0:0"`, `command: chown -R 1000:1000 /app/uploads`, `restart: "no"`) that the app services `depends_on`, or document a host-side `chown` in the deploy guide — prefer the init service (self-contained).
3. If Docker is unavailable in the session, make the compose/Dockerfile edits anyway, and write exact validation commands for Rex into FOLLOWUPS_NOTES.md: `docker compose -f docker-compose.prod.yml up -d --build`, then `docker exec parvagas-backend-api id -u` → expect `1000`, plus an upload smoke test.
4. **Verify (if Docker available):** build + run, `id -u` = 1000 in each fixed container, upload endpoint writes successfully, `/health` 200.

## Task 3 — Remove `unsafe-eval` from CSP (MEDIUM #3)

**Files:** `next.config.mjs` (the `csp` constant).

**Steps:**
1. Remove `'unsafe-eval'` from `script-src` only. Leave `'unsafe-inline'` (Next hydration + reCAPTCHA need it; a nonce-based CSP is a bigger project — note it as future work).
2. `npm run build` then `npm start` and exercise the app headlessly if possible; otherwise at minimum load the built output and check the browser console instructions for Rex.
3. Grep for eval-dependent libs before deciding it's safe: `grep -rn "new Function\|eval(" node_modules/@material-tailwind node_modules/lottie-react --include="*.js" -l | head`. lottie-web historically used `eval`-like paths — if hits are found in code paths actually shipped, test a page using Lottie animations specifically.
4. **Verify:** build green + manual checklist entry for Rex: open site with DevTools console, confirm zero CSP violation errors on: landing page, job listing, CV builder, login (reCAPTCHA), any Lottie animation. If violations appear in his test, he reverts this one commit.

## Task 4 — reCAPTCHA site key: fail loudly (LOW #5)

**Files:** `src/app/layout.tsx` (hardcoded fallback key in the script src).

**Steps:** replace the `|| "6Lf..."` fallback: if `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is unset, skip rendering the reCAPTCHA `<script>` entirely and `console.error("NEXT_PUBLIC_RECAPTCHA_SITE_KEY not set — captcha disabled")` (build-time `throw` would break preview deploys; degrade loudly instead). Check `.env.example` documents the var. **Verify:** build + vitest; confirm the env var is present in `.env.vercel-prod` names list so prod isn't silently captcha-less.

## Task 5 — Pydantic v3-proofing (LOW #7)

**Files:** `backend-python/app/schemas/__init__.py` — 9 occurrences of class-based `class Config`.

**Steps:** mechanical swap to `model_config = ConfigDict(...)` (`from pydantic import ConfigDict`), e.g. `class Config: from_attributes = True` → `model_config = ConfigDict(from_attributes=True)`. Also grep the whole app for other deprecated patterns: `@validator` (→ `@field_validator`), `.dict()` (→ `.model_dump()`), `.json()` (→ `.model_dump_json()`) — fix only what pytest exercises; list the rest in FOLLOWUPS_NOTES.md. **Verify:** pytest with `-W error::DeprecationWarning` scoped to pydantic: `python -m pytest -q -W "error::pydantic.PydanticDeprecatedSince20"` → zero errors.

## Task 6 — httpx bump (LOW #8)

**Steps:** `httpx==0.25.2` → latest 0.28.x in requirements.txt. Breaking changes to check: 0.28 removed some deprecated arguments (`proxies=`, `app=` shortcut). Grep usage: `grep -rn "httpx" backend-python/app backend-python/tests | grep -v __pycache__`. The scraper uses `httpx.get` inside `_conditional_get` and tests monkeypatch `httpx.get` — both fine. If `TestClient`/`app=` patterns appear, adjust per httpx 0.28 notes. **Verify:** full pytest, plus the scraper test file explicitly.

## Not for Sonnet — Rex's manual items

- **MEDIUM #4 — move the project out of `~/Downloads`** (cloud-sync leak risk for `.env`/`.env.local`): user action on his machine; Sonnet only adds a warning line to README's setup section.
- **LOW #6 — tracked `.env.vercel-*` files:** policy note only; Sonnet adds a header comment to both files: `# PUBLIC values + placeholders ONLY — real secrets live in the Vercel dashboard, never here.`

## Finish

1. Re-run both full suites + `npm run build` one last time on the branch tip.
2. Write FOLLOWUPS_NOTES.md: per-task status (done/reverted/needs-Rex), verification output summary, and Rex's manual checklist (Docker validation from Task 2, CSP browser check from Task 3).
3. `git log --oneline` the branch and present both files.
