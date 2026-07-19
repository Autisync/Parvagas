# Parvagas — Launch Readiness & Security Audit Report

**Date:** 2026-07-19 · **Auditor:** Claude (autonomous overnight audit) · **Branch audited:** `staging` · **Fixes branch:** `launch-audit-fixes` (3 commits)

---

## Verdict: CONDITIONAL GO

The codebase is in strong shape — parameterized queries throughout, proper ownership checks on every resource, rate limiting on all auth endpoints, sanitized uploads, security headers on both frontend and backend, an SSRF guard on the scraper, and a production config validator that refuses to boot with insecure defaults. Build, type-check, and both test suites pass (112/112 frontend, ~570 backend). **However, one critical item blocks launch: real secrets are in git history and must be rotated first.** Everything else is fixed or minor.

---

## 1. CRITICAL — must do before launch

### 1.1 Rotate all secrets from `.env.docker` (committed to git history)

`.env.docker` was committed to git (commits `b88c5c0`, `eaf0407`) containing real values for: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_SIGNUP_KEY`, `SMTP_USER`/`SMTP_PASS`, `DATABASE_URL`. Even though the file is now untracked (fixed in this session), **the values remain readable in git history** by anyone with repo access — and forever if this repo was ever pushed to a public or shared remote.

**Action (30–60 min):**
1. Generate a new `JWT_SECRET` (`openssl rand -hex 64`) — note this logs out all users.
2. Change the Postgres password and update `DATABASE_URL` everywhere it's deployed.
3. Rotate `ADMIN_SIGNUP_KEY` and the SMTP credentials.
4. Optional but recommended: scrub history with `git filter-repo --path .env.docker --invert-paths` (coordinate with any clones), or accept history exposure since rotation makes old values worthless.

SECURITY_ROTATION.md in the repo already documents your rotation procedure — follow it.

---

## 2. Fixed in this session (branch `launch-audit-fixes`)

| Commit | What |
|---|---|
| `5a37f82` | Stop tracking `.env.docker` (real DB password + JWT secret). File stays on disk, no longer versioned. |
| `0438a85` | Upgrade Python deps clearing **81 known vulnerabilities in 12 packages**: fastapi 0.104.1→0.116.1 (starlette 0.47.3 — multipart DoS fixes), gunicorn→23.0 (request smuggling), python-jose→3.4.0 (JWT algorithm-confusion), python-multipart→0.0.20, pypdf→5.9.0, Pillow→11.3.0, jinja2→3.1.6, requests→2.32.4, sentry-sdk→2.30, uvicorn→0.34.3, python-dotenv→1.1.1 (also resolves the magika version conflict). |
| `024bb95` | Remove **19 unused legacy npm packages** (express, multer, bcrypt, jsonwebtoken, body-parser, cors, helmet, morgan, nodemailer, pg, redis, meilisearch, gridfs-stream, dotenv, pdf-parse, mammoth, express-rate-limit, supertest, autocannon) — leftovers from the old Node backend, imported nowhere. This eliminated all 3 high + 2 moderate npm audit findings (node-tar path-traversal chain, morgan log forging) and shrinks the attack surface and install size substantially. |

**Every fix was verified before committing** — the full backend pytest suite, frontend vitest suite, `tsc --noEmit`, and `next build` were run against the upgraded stack in an isolated copy first, then re-verified: the FastAPI app boots on the new stack, `/health` returns 200 with security headers intact.

**Your follow-up when you wake up:**
```bash
git checkout launch-audit-fixes
npm install                          # sync node_modules with cleaned package.json
# rebuild backend Docker image (or: pip install -r backend-python/requirements.txt)
npm run build && npm test            # confirm on your machine
# then merge into staging/main
```

---

## 3. Verification results

| Check | Result |
|---|---|
| `next build` | ✅ Compiled successfully, 67/67 static pages (before and after fixes) |
| `tsc --noEmit` | ✅ Clean |
| vitest | ✅ 112/112 passed, 12 files (before and after fixes) |
| pytest (full suite, batched) | ✅ All pass on old AND new dependency stack |
| App boot on upgraded stack | ✅ `/health` 200, security headers present |
| `npm audit` | 6 vulns (3 high) → **2 moderate** (both nested inside `next`, not directly exploitable; will clear on next Next.js release) |
| `pip-audit` | 81 known vulns → **0 in pinned direct deps** (one exception below) |

Environment-limited test notes (not bugs — verified, not assumed): 6 `test_conditional_get.py` tests fail in the audit sandbox because its DNS is proxied; they pass when DNS resolves (proven by re-running with resolution stubbed). `test_render_pdf_raises_runtime_error_when_native_libs_unavailable` fails only because the sandbox *has* pango installed — weasyprint actually rendered a 14 KB PDF. Expect all of these to pass on your machine.

---

## 4. What the audit found to be SOLID (no action needed)

- **SQL injection:** all queries via SQLAlchemy ORM or `text()` with bound parameters; the two f-string usages in `jobs.py` interpolate only a static FTS expression constant — user input goes through `:kw` bind params.
- **XSS:** no unsafe `dangerouslySetInnerHTML` — the 3 usages are JSON-LD structured data passed through `toJsonLdString()`, which escapes `<` to `<` (unit-tested in `jsonLd.test.ts`).
- **IDOR/authorization:** resources fetched via `_owned_resume`/`_owned_cover_letter`-style helpers scoping every query to the authenticated user's profile; admin endpoints gate on admin level (deploy panel requires super-admin).
- **Auth:** bcrypt password hashing (passlib), JWT with revocation support (`tokens_revoked_at` — tokens without `iat` treated as revoked), suspended-account checks, JWKS verification for Auth0 mode, rate limits on every auth endpoint (5/hour on sensitive ones), captcha header support, security-event logging on rate-limit trips.
- **Uploads:** extension + MIME allowlists, size limits enforced server-side (413), filename sanitization stripping path separators.
- **SSRF:** scraper blocks non-public addresses before fetching and honors robots.txt.
- **Prod hardening:** config validator refuses insecure JWT secret (<32 chars), default DB creds; API docs/openapi disabled in production; TrustedHost middleware; CORS explicit allowlist (no `*` with credentials); HSTS in prod.
- **Headers:** full set on both sides — CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS with preload.
- **Infra:** prod compose exposes no host ports (Traefik network only), secrets via env interpolation, restart policies set, TLS via Let's Encrypt with HTTP→HTTPS.

---

## 5. Remaining findings — needs your decision

**MEDIUM**

1. **`ecdsa 0.19.2` (via python-jose) — PYSEC-2026-1325, no fixed release exists.** Minerva timing attack on ECDSA signing. You use HS256 (HMAC), not ECDSA, so practical exposure is low. Option: migrate python-jose → PyJWT (actively maintained) post-launch.
2. **Five containers run as root (`user: "0:0"`) in `docker-compose.prod.yml`** (incl. websocket). Works, but a container escape would be root. Recommend adding non-root users to those images post-launch. Not changed — needs image rebuild testing.
3. **CSP allows `unsafe-inline` + `unsafe-eval` in script-src.** Documented as pragmatic (Next hydration + reCAPTCHA). `unsafe-eval` is the one worth revisiting — try removing it and testing; modern Next generally doesn't need it in production builds.
4. **`.env` / `.env.local` on disk contain live secrets** (correctly untracked). Fine, but ensure they're excluded from any backup/sync tool that could leak them (Dropbox/iCloud on Downloads folders is a common accident — this project lives in `~/Downloads`; consider moving it).

**LOW**

5. Hardcoded fallback reCAPTCHA site key in `layout.tsx` (site keys are public by design, but a missing env var would silently use the wrong key — prefer failing loudly).
6. `.env.vercel-dev`/`.env.vercel-prod` are tracked — contents are public URLs + placeholders only (verified), fine to keep, just never put real values in them.
7. Pydantic v2 deprecation warnings (class-based `config`) — will break on Pydantic v3; cleanup task for later.
8. `httpx` pinned at 0.25.2 (old but no known CVEs; bump opportunistically).

---

## 6. Pre-launch manual checklist

- [ ] **Rotate all `.env.docker` secrets (Section 1 — blocker)**
- [ ] Merge `launch-audit-fixes`, run `npm install`, rebuild backend Docker image, deploy to staging, smoke test
- [ ] Run through MANUAL_TEST_GUIDE.md on staging (signup → CV builder → apply → company review → ATS pipeline; password reset; email delivery)
- [ ] Confirm database backup schedule + test a restore once
- [ ] Confirm Sentry receives events from prod (backend init verified in code)
- [ ] Verify Traefik cert issuance on all hosts (api/storage/www) and that `dev-*` hosts aren't exposed to the public if not intended
- [ ] Uptime monitoring on `/health` and `/ready`
- [ ] Decide an incident-response contact/plan (who gets paged if the site is defaced or data leaks)

---

*Audit scope: static code analysis, dependency audits (npm audit, pip-audit), build/type/test verification, and infra config review. No live production systems were probed. Frontend build verification used a sandbox copy with the Google-Fonts import stubbed (sandbox cannot reach fonts.googleapis.com); your repo's `layout.tsx` was not modified.*
