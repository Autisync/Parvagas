# Test Plan — career-ops-inspired improvements

Testing plan and checklist scoped strictly to the five improvement areas drawn
from [santifer/career-ops](https://github.com/santifer/career-ops). Parvagas
continues to use **Llama (via Ollama)** as its AI processor, so points 1, 2, and
4 depend on Ollama being reachable; points 3 and 5 do not.

Each area is split into four test layers so a component can be validated in
isolation before it's wired into the platform:

- **Unit** — pure functions, no DB/network (`pytest tests/`)
- **Integration** — endpoint + DB, Celery task behavior
- **Llama-quality** — prompt-output validation (AI features only; guards against silent model regressions)
- **E2E/manual** — browser verification of the candidate/admin-facing surface

---

## Execution plan

Build order is driven by dependencies, risk, and value. Point 5 already exists
and is the foundation everything else sits on. The three Llama features (1, 2, 4)
share a single dependency — a hardened LLM-invocation layer — so that gets built
once, first, in Phase 0. Point 3 touches only the scraper and can run in
parallel with the Llama work on a separate track.

**Ship everything behind a feature flag** so each phase can merge and deploy
"dark" (off in production), be smoke-tested in staging, then enabled per cohort
and monitored before full rollout. No phase is "done" until its matching test
checklist below is green.

### Phase 0 — Shared LLM service layer  *(prereq for Points 1, 2, 4)* ✅ done
- `app/services/llm_service.py`: `chat_json(system_prompt, user_prompt, *, fallback, ...)` — one OpenAI-compatible entry point with a hard timeout and structured-output (JSON-mode) parsing; **never raises**, always returns `fallback` on any failure (disabled, network error, timeout, non-JSON, wrong shape). Reuses the same provider-switch pattern as the existing `CVParserService` AI path rather than inventing a second one.
- Settings (`app/core/config.py`): `LLM_ENABLED`, `LLM_PROVIDER` (default `ollama`), `LLM_BASE_URL` (default `http://ollama:11434/v1`, matching the Ollama service already in `docker-compose.yml`), `LLM_API_KEY`, `LLM_MODEL` (default `llama3.2:3b`), `LLM_TIMEOUT_SECONDS`. Ollama needs no API key; other providers do.
- Grounding ("don't invent facts") is enforced per-caller via the system prompt each Phase 1/2/4 feature supplies — same approach the existing CV-parser AI prompt already uses — rather than a separate helper, to avoid a layer that has no behavior of its own.
- No retry loop: a single bounded-timeout attempt that falls back on any failure is sufficient for the stated exit criteria and keeps latency predictable; revisit only if flaky-network false-fallbacks show up in practice.
- **Exit:** `tests/test_llm_service.py` (12 tests) proves disabled/timeout/network-error/HTTP-error/malformed-JSON/non-object-JSON all fall back cleanly, and the success path parses correctly. Live "Ollama reachable" harness check still needs to run in an environment with the `ollama` container (not available in this sandbox) — code defaults are wired to it out of the box.

### Phase 1 — Point 1: Llama scoring in the auto-apply matcher  *(highest value, most contained)*
- Add an optional Llama refinement pass to `score_job_for_candidate` behind a flag: it adjusts the heuristic score and generates PT reason strings, falling back to today's deterministic score on any failure.
- Author the golden-set eval fixture (~10 known-verdict pairs).
- **Depends on:** Phase 0. **Exit:** Point 1 checklist green.

### Phase 2 — Point 2: ATS keyword-injected CV export
- Add a Llama pass to `cv_export_service` that injects the target job's keywords into the summary/skills sections, grounded strictly to the real profile.
- **Depends on:** Phase 0. **Exit:** Point 2 checklist green (hallucination + Ollama-down degradation are the gating items).

### Phase 3 — Point 3: Portal-scanning adapters  *(parallel track — no Llama)*
- Add an adapter framework + Greenhouse / Ashby / Lever adapters driven by `SCRAPER_SOURCES`, each with a saved-response fixture.
- **Depends on:** nothing (independent of Phase 0). **Exit:** Point 3 checklist green.

### Phase 4 — Point 4: Premium AI tools (interview-prep, cover letter, company research)
- New endpoints + paid-tier gate + the `interview-prep` / `cover` / `deep` Llama modes.
- **Depends on:** Phase 0 and the paid-tier entitlement check existing. **Exit:** Point 4 checklist green.

### Phase 5 — Regression + release gate
- Run the Point 5 regression checklist and the full "definition of done" gate before enabling any flag in production.

### Sequencing summary

| Phase | Work | Depends on | Llama? | Parallelizable |
|-------|------|-----------|--------|----------------|
| 0 | Shared LLM service layer | — | — | — |
| 1 | Auto-apply Llama scoring | 0 | yes | with 3 |
| 2 | ATS CV keyword injection | 0 | yes | with 3 |
| 3 | Portal-scanning adapters | — | no | with 0/1/2/4 |
| 4 | Premium AI tools | 0 + paid gate | yes | with 3 |
| 5 | Regression + release | 1–4 | — | — |

---

## Test harness (run for every area)

- [ ] Backend unit/integration: `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 -m pytest tests/ -q` — all green
- [ ] Migration single-head invariant: `pytest tests/test_migrations.py` passes (any new model needs a migration)
- [ ] Frontend types: `npx tsc --noEmit -p tsconfig.json` — clean
- [ ] Frontend units: `npx vitest run` — all green
- [ ] Ollama reachable from the worker container: `docker compose exec celery-worker curl -s http://ollama:11434/api/tags` returns the loaded model — **precondition for points 1, 2, 4; if it fails, those features must degrade gracefully, not 500**

---

## Point 1 — Richer job-fit scoring (Llama) in the auto-apply matcher

**Touchpoints:** `app/services/auto_apply_service.py` (`score_job_for_candidate`,
`generate_proposals_for_candidate`, `candidate_is_eligible`, `MATCH_THRESHOLD`),
the new Llama scoring pass, proposal endpoints
`/candidates/auto-apply/proposals(/:id/approve|dismiss)`.

### Unit
- [ ] Score stays clamped to 0–100 for every input combination (empty profile, empty job, maxed-out match)
- [ ] Weighted dimensions each contribute independently (mutate one signal → only its band moves)
- [ ] `MATCH_THRESHOLD` boundary: a job scoring exactly the threshold is proposed; threshold-minus-1 is not
- [ ] Eligibility gate still blocks: no opt-in, no categories, no CV, or missing contact info → zero proposals
- [ ] Dedup holds: never re-proposes a job already proposed or already applied to
- [ ] Caps hold: `MAX_NEW_PROPOSALS_PER_RUN` and `MAX_PENDING_PROPOSALS` enforced

### Llama-quality
- [ ] Llama scoring call has a hard timeout and, on timeout/error/garbage output, **falls back to the deterministic heuristic score** (never crashes the sweep) — test with Ollama stopped
- [ ] Output parsing rejects malformed responses (non-numeric score, score >100, missing reasons) and logs, doesn't persist junk
- [ ] Golden-set eval: ~10 (candidate, job) pairs with known verdicts (strong / borderline / clearly wrong); assert Llama scores land in the expected band. Re-run after any prompt edit
- [ ] Portuguese `pt/` prompt produces Portuguese reason strings (the "porquê foi sugerido" text renders in PT, not EN)
- [ ] Determinism check: same input scored twice stays within an acceptable delta (low `temperature`; flag if it swings wildly)

### Integration / E2E
- [ ] `generate_auto_apply_proposals` Celery task runs end-to-end against a seeded DB and creates proposals with populated `match_score` + `match_reasons`
- [ ] Candidate sees proposals in CV-e-Documentos with score % and reasons; Approve creates a real `JobApplication` tagged `auto_apply`; Dismiss creates nothing
- [ ] Approving a stale/expired/other-candidate's proposal is rejected (409/404) — existing endpoint tests still pass

---

## Point 2 — ATS CV generation with keyword injection (Llama)

**Touchpoints:** `app/services/cv_export_service.py` (`to_pdf`, `to_docx`,
`to_json_resume`), the CV HTML/template + Playwright PDF render, the Llama
keyword-injection pass, `GET /candidates/cv/export`.

### Unit
- [ ] Base export still works with no target job (generic CV) — PDF, DOCX, JSON all produce valid, non-empty files
- [ ] Keyword-injection pass is additive: inserts the target job's required skills into summary/skills **without dropping or fabricating** the candidate's real experience (assert original sections survive)
- [ ] Empty/partial profile still renders a valid document (no crash on missing summary, skills, or experience)

### Llama-quality
- [ ] Injected content is grounded — Llama must not invent employers, dates, or degrees the candidate never entered (hallucination guard; highest-risk item)
- [ ] Truncation/length: a very long profile + long job description doesn't exceed context or produce a truncated CV
- [ ] Graceful degradation: Ollama down → export falls back to the non-tailored CV instead of failing the download

### Integration / E2E
- [ ] `GET /candidates/cv/export?format=pdf|docx|json` returns correct content-type and a downloadable file for an authenticated candidate
- [ ] Rendered PDF opens and is visually intact (fonts, layout) — verify via the CV-e-Documentos export buttons
- [ ] ATS sanity: extract text from the generated PDF and confirm injected keywords are present as real text (not images)

---

## Point 3 — Portal-scanning configs (no Llama)

**Touchpoints:** `app/workers/tasks.py::scrape_external_jobs`, `SCRAPER_SOURCES`
config, per-portal adapters (Greenhouse/Ashby/Lever + generic JSON/RSS), the
dedicated `celery-worker-scraper` queue, admin scraped-jobs review UI.

### Unit
- [ ] Each new adapter parses a **saved fixture** of that portal's real response into the normalized `ScrapedJob` shape (title, company, location, description, url) — fixture-driven, no live network
- [ ] Malformed/empty feed → adapter returns `[]`, never throws
- [ ] Dedup by `content_hash` still prevents the same listing being ingested twice across sources
- [ ] Per-run budget caps (`SCRAPER_MAX_INGEST_PER_RUN`, `SCRAPER_RUN_BUDGET_SECONDS`) still enforced with multiple sources configured

### Integration / E2E
- [ ] `scrape_external_jobs` runs on the `scraping` queue only (doesn't starve email/parsing workers) — verify routing
- [ ] A configured source with a hanging/slow endpoint is time-boxed and doesn't block the run
- [ ] Newly scraped jobs land in admin review with quality score/flags; publishing one creates a live `Job` with the real hiring company + `external_contact_email` carried over
- [ ] `SCRAPER_SOURCES` empty/unset → task no-ops cleanly (current production state), doesn't error

---

## Point 4 — Interview-prep / cover-letter / company-research (Llama, premium)

**Touchpoints:** new endpoints + Llama prompt modes (`interview-prep`, `cover`,
`deep`), gated behind the paid tier.

### Unit / access-control
- [ ] Each new endpoint requires an authenticated candidate; unauthenticated → 401/403
- [ ] Paid-tier gate: a non-entitled candidate is blocked (402/403), an entitled one is allowed — test both sides
- [ ] Input validation: missing job/profile context returns a clean 400, doesn't call the model with empty prompts

### Llama-quality
- [ ] STAR interview stories are built **from the candidate's actual CV experience**, not invented (grounding check)
- [ ] Cover letter references the real target job + real candidate details; no placeholder leakage (`[Company Name]`, etc.)
- [ ] Output language matches locale (PT default)
- [ ] Ollama down → endpoint returns a graceful "try again later" error, not a 500

### E2E
- [ ] Feature reachable only from the paid surface; free users see the upsell, not the tool

---

## Point 5 — Propose-then-approve design (already built) — regression only

**Touchpoints:** existing `test_auto_apply_matching.py`,
`test_auto_apply_proposal_endpoints.py`, `test_no_account_apply_tracking.py`.

- [ ] **Invariant test — the load-bearing one:** approving a proposal is the *only* path that creates a `JobApplication`; the matcher/sweep never auto-submits. Keep the test that asserts Dismiss creates zero applications
- [ ] All existing auto-apply and no-account-flow tests still pass unchanged after points 1–4 land
- [ ] Human-in-the-loop copy stays accurate ("nenhuma candidatura é submetida sem a sua aprovação") — no drift toward "automatic submission"

---

## Definition of done (ship gate for any of the 5)

- [ ] Its unit + integration tests are written and green
- [ ] AI features (1, 2, 4) have a graceful-degradation test proving they don't 500 when Ollama is unavailable
- [ ] `pytest tests/`, `tsc --noEmit`, and `vitest run` all pass together
- [ ] Browser-verified on the actual candidate/admin surface
- [ ] New DB columns/tables have a migration and `test_migrations.py` still shows a single head

---

## Cross-cutting risk note

The three Llama-backed points (1, 2, 4) share the same two failure modes —
**hallucination** (inventing candidate facts) and **hard dependency on Ollama
being up**. Every AI checklist above has an explicit test for each, because
those are the two things that will actually bite in production, not the happy
path.
