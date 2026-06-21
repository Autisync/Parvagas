# ADR-001: Schema management & production hardening for the Python backend

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Backend owners (Parvagas)

## Context

The FastAPI backend reached feature-completeness (auth, candidates, companies,
applications, admin panel, ads) but was not deployable to a fresh production
database safely. Concrete forces at play, all verified in code:

1. **Mixed schema strategy.** Base tables (`users`, `companies`,
   `candidate_profiles`, `cv_uploads`, `ad_campaigns`, token tables) were created
   only by `Base.metadata.create_all()` at `app/main.py` import time. The Alembic
   chain started at `20260517_0001_seed_super_admin` (`down_revision = None`),
   which **autoloads** the `users` table and seeds a super-admin — so
   `alembic upgrade head` on an empty DB fails: it seeds into a table no
   migration creates. `create_all` also never alters existing tables, so model
   changes silently never reach an existing database.
2. **Insecure secret fallbacks.** `JWT_SECRET` defaulted to a public literal and
   the DB URL to `change_me`; a missing env var let the app boot with a known
   signing key (admin-JWT forgery).
3. **Migrations not applied on deploy.** The Docker `CMD` ran `uvicorn` directly;
   nothing ran `alembic upgrade head`.
4. **Operational gaps.** No rate limiting (despite `slowapi` installed), `/ready`
   returned a static value without checking Postgres/Redis, no error monitoring,
   a single uvicorn process, deprecated `@app.on_event`, and no security headers.

## Decision

Adopt **Alembic as the single source of truth** for schema, with a startup
gate and fail-fast configuration:

1. Add `20260516_0000_initial_schema` (new root, `down_revision = None`) that
   creates every base table, idempotently (guarded by `inspector.has_table`).
   Re-parent the super-admin seed onto it. Result: one linear chain, one head,
   `alembic upgrade head` works on a fresh DB.
2. Remove `create_all()` from the import path. Schema is owned by migrations.
3. Run `alembic upgrade head` in the container entrypoint before serving.
4. Fail-fast in `Settings` when `APP_ENV` is not a dev/test/ci value and a
   secret is still its insecure default.
5. Wire the operational hardening: slowapi rate limits on auth, real `/ready`
   probes, optional Sentry, Gunicorn+uvicorn workers, security headers,
   `lifespan` instead of `on_event`.

## Options Considered

### Option A: Alembic as source of truth + startup gate (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one new migration + entrypoint |
| Cost | One-time authoring; existing DBs need `alembic stamp` |
| Scalability | High — standard, supports zero-downtime migration flows |
| Team familiarity | High — Alembic already configured |

**Pros:** deterministic schema, reviewable diffs, rollbacks, works on fresh DB.
**Cons:** existing dev DBs created by `create_all` must be stamped once.

### Option B: Keep `create_all`, drop Alembic
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Low upfront, high later |
| Scalability | Poor — no ALTERs, no history, no rollback |

**Pros:** zero work. **Cons:** can't evolve schema, no audit trail, the existing
seed migration still breaks. Rejected.

### Option C: Autogenerate a squashed migration from models
**Pros:** fast. **Cons:** autogen misses the existing `applications` table nuances
(guards, partial columns added across 0003/0004) and would fight the existing
chain. Hand-authoring the root is safer. Rejected.

## Trade-off Analysis

The only real cost of Option A is the one-time reconciliation for databases that
were already created by `create_all`: they must be marked as already-migrated
(`alembic stamp head`) so the idempotent root no-ops. The root migration's
`has_table` guards make this safe either way. In exchange we get a schema that is
deterministic, versioned, and deployable from empty — the prerequisite for any
real production posture.

## Consequences

- **Easier:** fresh deploys, schema review, rollbacks, CI that spins up an empty
  DB and runs `alembic upgrade head`.
- **Harder:** developers must write a migration for model changes (no more
  implicit `create_all`). This is the intended discipline.
- **Revisit:** when adding the still-missing domain tables (`jobs`,
  `scraped_jobs`, `notifications`, `audit_logs`) that some routers reference,
  each needs its own migration.

## Action Items

1. [x] `20260516_0000_initial_schema` root migration (idempotent).
2. [x] Re-parent `20260517_0001` onto the new root.
3. [x] Remove `create_all()` from `app/main.py`.
4. [x] Fail-fast secrets in `app/core/config.py`.
5. [x] `docker-entrypoint.sh` runs `alembic upgrade head`, then Gunicorn.
6. [x] Rate limiting, real `/ready`, Sentry, security headers, `lifespan`.
7. [x] Test suite + `requirements-dev.txt`.
8. [ ] **Operator action:** on pre-existing databases run `alembic stamp head`
   once (see `docs/production-launch-runbook.md`).
