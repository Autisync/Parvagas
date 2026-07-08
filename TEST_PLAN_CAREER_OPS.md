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

### Phase 1 — Point 1: Llama scoring in the auto-apply matcher  *(highest value, most contained)* 🟡 mostly done
- `_llm_refine_score()` in `auto_apply_service.py`: optional refinement pass behind `AUTO_APPLY_LLM_SCORING_ENABLED` (default **off** — ship dark). Only runs on jobs that already cleared the heuristic `MATCH_THRESHOLD` (cost control), returns PT reason strings, falls back to the untouched heuristic score/reasons on any failure — disabled flag, LLM error, or malformed/out-of-range output. Defense-in-depth try/except added around the `chat_json` call itself so a bug there can't crash the whole candidate's proposal sweep.
- Golden-set fixture started (3 of ~10 pairs) in `tests/test_auto_apply_llm_golden.py`, gated behind `RUN_LLM_GOLDEN_TESTS=1` — **not yet run against a live model**, no Ollama available in this environment.
- **Remaining before fully green:** run the golden set against real Ollama, expand to ~10 pairs, add the determinism check, confirm PT output live (all four need actual model access — can't be done from this sandbox).
- **Depends on:** Phase 0. **Exit:** Point 1 checklist green (currently: Unit ✅, Integration/E2E ✅, Llama-quality partial — see checklist).

### Phase 2 — Point 2: ATS keyword-injected CV export 🟡 mostly done
- `inject_job_keywords()` in `cv_export_service.py`, behind `CV_EXPORT_LLM_INJECTION_ENABLED` (default off). Wired into `GET /candidates/cv/export` via a new optional `targetJobId` query param — omitted or flag-off → byte-identical to the pre-existing export. Hallucination guard is computational (skill intersection with the job's own required-skills list), not just prompt instruction — see Point 2 checklist.
- **Remaining before fully green:** truncation/length test for very long profiles, a real browser check that exported PDFs still render correctly, and an ATS-text-extraction check against real (live-model) injected content — the last one needs Ollama access this sandbox doesn't have.
- **Depends on:** Phase 0. **Exit:** Point 2 checklist green (currently: Unit ✅, hallucination guard ✅, Ollama-down degradation ✅; length/visual/ATS-extraction checks still open).

### Phase 3 — Point 3: Portal-scanning adapters  *(parallel track — no Llama)* 🟡 mostly done
- Adapter framework already existed (`SourceAdapter` base class + `_normalise()` + `_ADAPTERS` registry) — added `GreenhouseAdapter`, `LeverAdapter`, `AshbyAdapter` to it, each configurable via `SCRAPER_SOURCES` with `{"type": "greenhouse"|"lever"|"ashby", "url": "<bare token/slug/board-name OR full API URL>"}`.
- **Remaining before fully green:** the fixtures are hand-authored from each platform's documented public API shape, not a captured real response (no live network access when written) — before pointing this at a real employer's board, verify field names against an actual live response and adjust if the docs drifted. No dedicated queue-routing/slow-endpoint tests written this phase (pre-existing infra, reused unchanged by the new adapters).
- **Depends on:** nothing (independent of Phase 0, ran in parallel as planned). **Exit:** Point 3 checklist green (Unit ✅ with the fixture caveat noted; Integration/E2E mostly pre-existing/unverified-this-phase).

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
- [x] Score stays clamped to 0–100 for every input combination (empty profile, empty job, maxed-out match) — `test_auto_apply_matching.py`, `_llm_refine_score` clamps LLM output too (`test_refinement_clamps_out_of_bounds_score`)
- [x] Weighted dimensions each contribute independently (mutate one signal → only its band moves) — `test_auto_apply_matching.py`
- [x] `MATCH_THRESHOLD` boundary: a job scoring exactly the threshold is proposed; threshold-minus-1 is not — `test_auto_apply_matching.py`
- [x] Eligibility gate still blocks: no opt-in, no categories, no CV, or missing contact info → zero proposals — `test_auto_apply_matching.py`
- [x] Dedup holds: never re-proposes a job already proposed or already applied to — `test_auto_apply_matching.py`
- [x] Caps hold: `MAX_NEW_PROPOSALS_PER_RUN` and `MAX_PENDING_PROPOSALS` enforced — `test_auto_apply_matching.py`

### Llama-quality
- [x] Llama scoring call has a hard timeout and, on timeout/error/garbage output, **falls back to the deterministic heuristic score** (never crashes the sweep) — `tests/test_llm_service.py` (timeout/network/HTTP-error → fallback) + `tests/test_auto_apply_llm_scoring.py` (refinement layer falls back even if `chat_json` itself somehow raised — defense in depth added after this test caught the gap)
- [x] Output parsing rejects malformed responses (non-numeric score, score >100, missing reasons) and logs, doesn't persist junk — `test_auto_apply_llm_scoring.py::test_refinement_falls_back_when_llm_returns_out_of_range_score` etc.
- [ ] Golden-set eval: ~10 (candidate, job) pairs with known verdicts (strong / borderline / clearly wrong); assert Llama scores land in the expected band. Re-run after any prompt edit — **partial:** `tests/test_auto_apply_llm_golden.py` has 3 pairs (strong/borderline/wrong-field) and is wired to run against a real model via `RUN_LLM_GOLDEN_TESTS=1`, but hasn't been executed against a live Ollama yet (none available in this environment) and needs ~7 more pairs before this is a real golden set
- [ ] Portuguese `pt/` prompt produces Portuguese reason strings (the "porquê foi sugerido" text renders in PT, not EN) — prompt instructs PT output; needs a live-model run to confirm (blocked on Ollama access, same as above)
- [ ] Determinism check: same input scored twice stays within an acceptable delta (low `temperature`; flag if it swings wildly) — not yet written; needs a live model

### Integration / E2E
- [x] `generate_auto_apply_proposals` Celery task runs end-to-end against a seeded DB and creates proposals with populated `match_score` + `match_reasons` — covered transitively via `generate_proposals_for_candidate` tests (the task is a thin wrapper); no dedicated task-level test yet
- [x] Candidate sees proposals in CV-e-Documentos with score % and reasons; Approve creates a real `JobApplication` tagged `auto_apply`; Dismiss creates nothing — `tests/test_auto_apply_proposal_endpoints.py` (built with the original propose-then-approve feature)
- [x] Approving a stale/expired/other-candidate's proposal is rejected (409/404) — `test_auto_apply_proposal_endpoints.py`

---

## Point 2 — ATS CV generation with keyword injection (Llama)

**Touchpoints:** `app/services/cv_export_service.py` (`to_pdf`, `to_docx`,
`to_json_resume`, new `inject_job_keywords`), `GET /candidates/cv/export`
(new optional `targetJobId` param). Correction from the original plan: this
codebase renders PDF/DOCX directly with reportlab/python-docx, not an HTML
template + Playwright — no template layer to touch.

### Unit
- [x] Base export still works with no target job (generic CV) — PDF, DOCX, JSON all produce valid, non-empty files — `test_cv_export_llm_injection.py::test_base_export_still_works_with_no_target_job`
- [x] Keyword-injection pass is additive: inserts the target job's required skills into summary/skills **without dropping or fabricating** the candidate's real experience (assert original sections survive) — `test_injection_preserves_original_skills_and_adds_only_job_relevant_ones`, `test_injection_never_touches_experience_or_education`
- [x] Empty/partial profile still renders a valid document (no crash on missing summary, skills, or experience) — `test_base_export_survives_empty_profile`

### Llama-quality
- [x] Injected content is grounded — Llama must not invent employers, dates, or degrees the candidate never entered (hallucination guard; highest-risk item) — enforced computationally, not just by prompt: `inject_job_keywords` only ever adds a skill if it's BOTH in the LLM's suggestion AND in the job's own `requiredSkills` list (never a bare invention), and only touches summary/skills — experience/education/certifications pass through untouched. See `test_injection_preserves_original_skills_and_adds_only_job_relevant_ones` (rejects a fabricated skill not in the job listing).
- [ ] Truncation/length: a very long profile + long job description doesn't exceed context or produce a truncated CV — not yet tested
- [x] Graceful degradation: Ollama down → export falls back to the non-tailored CV instead of failing the download — `test_falls_back_when_llm_service_raises`, `test_falls_back_when_llm_returns_malformed_shape`, `test_falls_back_when_llm_returns_empty_summary`

### Integration / E2E
- [x] `GET /candidates/cv/export?format=pdf|docx|json` returns correct content-type and a downloadable file for an authenticated candidate — pre-existing behavior, unchanged when `targetJobId` is omitted (verified via unchanged base-export tests + endpoint wiring review)
- [ ] Rendered PDF opens and is visually intact (fonts, layout) — verify via the CV-e-Documentos export buttons — needs a browser/manual check, not done from this sandbox
- [ ] ATS sanity: extract text from the generated PDF and confirm injected keywords are present as real text (not images) — needs a live LLM run to produce real injected content to check against (blocked, same as Phase 1's golden-set items)

---

## Point 3 — Portal-scanning configs (no Llama)

**Touchpoints:** `app/workers/tasks.py::scrape_external_jobs`, `SCRAPER_SOURCES`
config, per-portal adapters (Greenhouse/Ashby/Lever + generic JSON/RSS), the
dedicated `celery-worker-scraper` queue, admin scraped-jobs review UI.

### Unit
- [x] Each new adapter parses a **saved fixture** of that portal's real response into the normalized `ScrapedJob` shape (title, company, location, description, url) — fixture-driven, no live network — `tests/test_scraper_portal_adapters.py` (Greenhouse/Lever/Ashby, 13 tests). **Caveat:** fixtures are hand-authored from each platform's documented public API shape, not captured from a real live response (no network access when written) — verify field names against a real board's actual response before enabling in production.
- [x] Malformed/empty feed → adapter returns `[]`, never throws — covered per adapter (malformed JSON, unreachable, wrong top-level shape)
- [x] Dedup by `content_hash` still prevents the same listing being ingested twice across sources — unaffected by this change: `content_hash()` operates on the normalized output every adapter (old and new) produces via the shared `_normalise()` helper, so pre-existing dedup coverage applies unchanged
- [x] Per-run budget caps (`SCRAPER_MAX_INGEST_PER_RUN`, `SCRAPER_RUN_BUDGET_SECONDS`) still enforced with multiple sources configured — unaffected: caps are enforced in `tasks.scrape_external_jobs` generically over whatever `get_adapters()` returns, and the new adapters reuse the same `_MAX_PER_SOURCE` cap as the existing ones

### Integration / E2E
- [ ] `scrape_external_jobs` runs on the `scraping` queue only (doesn't starve email/parsing workers) — pre-existing routing, unaffected by this change; not re-verified here
- [ ] A configured source with a hanging/slow endpoint is time-boxed and doesn't block the run — pre-existing `_get()` timeout/backoff applies to new adapters too (they all call `_get()`), but no dedicated test written this phase
- [ ] Newly scraped jobs land in admin review with quality score/flags; publishing one creates a live `Job` with the real hiring company + `external_contact_email` carried over — pre-existing pipeline, unaffected; not re-verified here
- [x] `SCRAPER_SOURCES` empty/unset → task no-ops cleanly (current production state), doesn't error — `get_adapters()` returns `[]` for empty/unset env (pre-existing, plus `test_get_adapters_ignores_unknown_type` for the adjacent "unknown type" case)

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
