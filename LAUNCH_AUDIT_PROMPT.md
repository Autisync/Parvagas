# Parvagas — Pre-Launch Readiness & Security Audit Prompt

Copy everything below the line into a new Claude session with this repo mounted.

---

You are conducting an autonomous overnight pre-launch audit of the Parvagas platform (Next.js frontend + Python backend, Supabase, Docker/Traefik, Vercel). The user is asleep. Work independently, make no assumptions requiring their input, and produce a complete deliverable by the end.

## Mission

Verify the system is ready for public launch and secure against hacks, injections, data breaches, and other compromises. Fix what is safe to fix; report everything else.

## Ground rules

1. **Git safety**: Create branch `launch-audit-fixes` off the current branch before touching any file. Commit each logical fix separately with a clear message. Never touch `main` directly. Never force-push.
2. **Fix policy**: Auto-fix only low-risk items — security headers, input validation, dependency patch/minor bumps, missing sanitization, config hardening. Anything architectural, behavior-changing, or uncertain goes in the report as a recommendation with a concrete patch suggestion.
3. **Secrets**: Never print secret values in output, reports, or commits. Refer to them by variable name only. If a secret is committed to git history, flag it CRITICAL with rotation instructions.
4. **No live probing**: Do not attack or scan deployed production systems. Static analysis, local builds, and local tests only.
5. **Verification**: After all fixes, re-run build + type-check + test suites. If a fix breaks something, revert that fix and report it instead.
6. **Usage budget**: You have a 5-hour session limit. Stop all new work at ~90% budget consumed and spend remaining budget finalizing the report — an incomplete audit with a complete report beats the reverse. Prioritize: secrets/injection > auth > dependencies > build/tests > infra > polish.

## Phase 1 — Recon (fast)

- Map the stack: `package.json`, `backend-python/` structure, entry points, API route inventory.
- Git state: current branch, uncommitted changes, whether `.env*` files are tracked (`git ls-files | grep -i env`).
- Identify all trust boundaries: public API endpoints, auth middleware, file upload paths, webhook receivers, WebSocket handlers.

## Phase 2 — Code security audit

**Injection**
- SQL: search for raw query construction, f-strings/string concat in queries, `text()` without bound params. All queries must be parameterized.
- Command: `subprocess`, `os.system`, `eval`, `exec`, `child_process` with user-influenced input.
- Path traversal: file operations using user-supplied names (CV uploads especially — check filename sanitization, extension allowlist, size limits, content-type verification).
- Template/XSS: `dangerouslySetInnerHTML`, unescaped rendering of user content (CV data is user-controlled and rendered — high-risk surface), `v-html`-style patterns.

**Auth & access control**
- Every API route: is auth enforced? Is object-level authorization checked (can user A fetch user B's CV by changing an ID — IDOR)?
- JWT: algorithm pinning, expiry, secret strength, verification on every protected route.
- Supabase: RLS policies enabled on all tables? Service-role key never exposed client-side (`NEXT_PUBLIC_` prefix audit)?
- Password reset flow: token entropy, expiry, single-use.
- Session handling on WebSocket connections.

**Data protection**
- Secrets scan: grep for hardcoded keys/tokens/passwords across the repo AND git history (`git log -p` sampling or `git grep` on history for known prefixes: `sk-`, `eyJ`, `postgres://`, `SUPABASE`, etc.).
- `.gitignore` covers all `.env*` variants actually present.
- PII handling: CVs contain personal data — check logging doesn't leak PII, error responses don't leak stack traces/internal paths in production mode.

**Input validation**
- Zod/Pydantic schemas on every endpoint accepting input; reject-by-default.
- File upload: MIME sniffing, max size, storage outside web root, no execution of uploaded content.
- Rate limiting on auth endpoints, upload endpoints, and expensive operations (CV parsing/AI calls).

## Phase 3 — Dependency audit

- `npm audit` (production deps priority); `pip-audit` or `safety` on backend requirements.
- Apply patch/minor fixes that pass tests; report majors.

## Phase 4 — Feature readiness

- `npm run build` and type-check must pass clean.
- Run vitest suite; run pytest suite. All failures are launch blockers unless clearly pre-existing/known — classify each.
- Cross-check `PRODUCT.md` / `README.md` feature claims against code: flag TODO/FIXME/stub/mock implementations in supposedly-done features.
- Check error handling: unhandled promise rejections, bare `except:`, missing error boundaries.

## Phase 5 — Infra & config

- `docker-compose.prod.yml`: no exposed internal ports, no default credentials, containers not running as root where avoidable, restart policies, resource limits.
- Traefik: TLS config, HTTP→HTTPS redirect, security headers middleware.
- `next.config.mjs`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- CORS: explicit origin allowlist, not `*`, credentials handling correct.
- Env hygiene: prod examples don't contain real values; dev-only flags (debug, verbose errors) off in prod config.
- Health check endpoints exist for orchestration.

## Phase 6 — Deliverables

Write `LAUNCH_READINESS_REPORT.md` at repo root containing:

1. **Go / No-Go verdict** with one-paragraph justification.
2. **Critical findings** (launch blockers) — each with location, exploit scenario, and fix.
3. **High / Medium / Low findings** — same structure, prioritized.
4. **Fixed in this session** — list of commits on `launch-audit-fixes` with what each does.
5. **Needs your decision** — items requiring the user's judgment, with recommended options.
6. **Verification results** — build/test output summary before vs. after fixes.
7. **Pre-launch checklist** — remaining manual steps (secret rotation, DNS, backups, monitoring, incident-response contact).

Finish by presenting the report file to the user.
