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
- Adapter framework already existed (`SourceAdapter` base class + `_normalise()` + `_ADAPTERS` registry) — added `GreenhouseAdapter`, `LeverAdapter`, `CareerjetAdapter` to it, each configurable via `SCRAPER_SOURCES`.
- **Angola-local research (2026-07-08):** replaced the originally-planned `AshbyAdapter` after actually researching Angola job platforms instead of guessing — see Point 3's "Adapter update" note above for what was found (Careerjet verified + real caveat about republishing terms; Jobartis/emprego.co.ao have no discoverable public API).
- **Remaining before fully green:** Greenhouse/Lever fixtures still need field-name verification against a real live response before production use. Careerjet needs its partner terms actually reviewed before enabling. No dedicated queue-routing/slow-endpoint tests written this phase (pre-existing infra, reused unchanged).
- **Depends on:** nothing (independent of Phase 0, ran in parallel as planned). **Exit:** Point 3 checklist green (Unit ✅ with fixture/ToS caveats noted; Integration/E2E mostly pre-existing/unverified-this-phase).

### Phase 4 — Point 4: Premium AI tools (interview-prep, cover letter, company research) 🟡 mostly done — unblocked, ships free
- **Decision (2026-07-08):** ship free now, bill later. Added `CandidateSubscription` (mirrors the company `Subscription` shape but intentionally not tied to the company-oriented `plans` table, since candidate pricing isn't decided) + `CANDIDATE_PREMIUM_ENABLED` flag, default `false` — while off, `candidate_has_premium_access()` always returns `True`, so every candidate gets full access today. Flipping the flag on later starts enforcing subscriptions with zero further migrations/code changes.
- Three endpoints built: interview-prep (STAR stories, skipped entirely — no LLM call — if the candidate has no real work experience to ground on), cover-letter, and a company-snapshot **scoped down from "research" to facts already in our own DB** (no live web access on the backend, so open-ended "research" would just be the model's possibly-stale training knowledge — same anti-hallucination principle as Phase 2).
- **Remaining before fully green:** live-model runs to confirm no placeholder leakage and PT output (blocked on Ollama access, same open item as Phases 1/2); no frontend UI yet (backend-only this phase, matching how 1–3 shipped).
- **Depends on:** Phase 0 (done). **Exit:** Point 4 checklist green (Unit/access-control ✅, Ollama-down degradation ✅; two Llama-quality items and the frontend still open).

### Phase 5 — Regression + release gate
- Run the Point 5 regression checklist and the full "definition of done" gate before enabling any flag in production.

### Sequencing summary

| Phase | Work | Status | Depends on | Llama? | Parallelizable |
|-------|------|--------|-----------|--------|----------------|
| 0 | Shared LLM service layer | ✅ done | — | — | — |
| 1 | Auto-apply Llama scoring | 🟡 mostly done | 0 | yes | with 3 |
| 2 | ATS CV keyword injection | 🟡 mostly done | 0 | yes | with 3 |
| 3 | Portal-scanning adapters | 🟡 mostly done | — | no | with 0/1/2/4 |
| 4 | Premium AI tools | 🟡 mostly done — ships free, billing flag ready | 0 | yes | with 3 |
| 5 | Regression + release | in progress | 1–4 | — | — |

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
- [x] **Frontend wired (2026-07-08):** CV-e-Documentos export section has a "Vaga alvo" selector (candidate's saved jobs) that appends `targetJobId` to the export request; the job detail page (`JobPrepPanel`) also offers "CV adaptado" PDF/DOCX downloads scoped to that specific job. `tsc`/`vitest` pass; not yet exercised against a live backend from this sandbox.
- [ ] Rendered PDF opens and is visually intact (fonts, layout) — verify via the CV-e-Documentos export buttons — needs a browser/manual check against a live backend, see the step-by-step test script below
- [ ] ATS sanity: extract text from the generated PDF and confirm injected keywords are present as real text (not images) — needs a live LLM run to produce real injected content to check against (blocked, same as Phase 1's golden-set items)

---

## Point 3 — Portal-scanning configs (no Llama)

**Touchpoints:** `app/workers/tasks.py::scrape_external_jobs`, `SCRAPER_SOURCES`
config, per-portal adapters (Greenhouse/Lever/Careerjet + generic JSON/RSS), the
dedicated `celery-worker-scraper` queue, admin scraped-jobs review UI.

**Adapter update (2026-07-08):** swapped `AshbyAdapter` for `CareerjetAdapter`
after research — Ashby had no evidence of Angola relevance. Researched real
Angola-local job platforms (Jobartis, emprego.co.ao, angolaemprego.com)
before touching this: none expose a discoverable public API or per-job feed
(angolaemprego.com's `/feed/` is real but publishes daily-roundup articles,
not one item per job). Careerjet is the one option verified against
official docs (careerjet.com/partners/api) to actually serve Angola
(careerjet.co.ao) with a documented JSON API — but **it's a live search
proxy meant for embedding search boxes, not a bulk-export feed, and using
it to republish listings onto our own board wasn't confirmed to comply
with their partner terms.** Read `CareerjetAdapter`'s docstring and
Careerjet's actual partner agreement before enabling it in production.
Greenhouse/Lever are kept — not Angola-native, but real coverage for the
multinational employers (oil & gas majors, global consultancies) who
actively hire in Angola through them.

### Unit
- [x] Each new adapter parses a **saved fixture** of that portal's real response into the normalized `ScrapedJob` shape (title, company, location, description, url) — fixture-driven, no live network — `tests/test_scraper_portal_adapters.py` (Greenhouse/Lever/Careerjet, 15 tests). **Caveat:** Greenhouse/Lever fixtures are hand-authored from documented public API shape, not a captured live response — verify field names against a real board before enabling. The Careerjet fixture is built from their officially-documented response schema (verified via docs, not memory), which is a stronger basis, but still not a captured live response.
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

**Touchpoints:** `POST /candidates/premium/interview-prep`,
`POST /candidates/premium/cover-letter`, `GET /candidates/premium/company-snapshot/{job_id}`
in `candidates.py`; `candidate_billing_service.py`; `CandidateSubscription` model.

**Billing decision resolved (2026-07-08):** ship as a **free feature now**.
`CANDIDATE_PREMIUM_ENABLED` defaults to `false` — while off, every candidate
gets full access regardless of subscription state, so the paid-tier
mechanism exists but enforces nothing yet. Flip the flag once real pricing
is decided; no further migration or code change needed to start enforcing.
"Company research" was scoped down from the original plan to a **snapshot
built only from facts already in our own DB** (`Company.name/website/description`
+ active job count) rather than free-form LLM "research," since the backend
has no live web-search access and open-ended company research would just be
the model's possibly-stale/hallucinated training knowledge — same
anti-hallucination principle as Point 2.

### Unit / access-control
- [x] Each new endpoint requires an authenticated candidate; unauthenticated → 401/403 — `get_current_user` dependency (existing pattern, shared with every other candidate endpoint); non-candidate role → 403 (`test_non_candidate_role_rejected`)
- [x] Paid-tier gate: a non-entitled candidate is blocked (402/403), an entitled one is allowed — test both sides — `test_candidate_billing_service.py` (6 tests) + `test_interview_prep_requires_active_subscription_when_flag_on` / `test_interview_prep_allowed_with_active_subscription_when_flag_on`
- [x] Input validation: missing job/profile context returns a clean 400, doesn't call the model with empty prompts — `test_missing_job_id_returns_400`, `test_unknown_job_returns_404`, `test_interview_prep_skips_llm_call_with_no_work_experience` (asserts the LLM is never even called without real experience to ground on)

### Llama-quality
- [x] STAR interview stories are built **from the candidate's actual CV experience**, not invented (grounding check) — computational, not just prompt instruction: `generate_interview_prep` returns `unavailable: true` without ever calling the LLM when `work_experience` is empty, since there's nothing real to ground a story in
- [ ] Cover letter references the real target job + real candidate details; no placeholder leakage (`[Company Name]`, etc.) — prompt instructs grounding; needs a live-model run to confirm no leakage in practice (blocked on Ollama access, same as Phases 1/2's remaining items)
- [ ] Output language matches locale (PT default) — prompts instruct Portuguese; needs a live-model run to confirm
- [x] Ollama down → endpoint returns a graceful "try again later" error, not a 500 — all three endpoints return `{"unavailable": true, "reason": ...}` (200, not 500) on any LLM failure — `test_interview_prep_falls_back_when_llm_raises`, `test_cover_letter_falls_back_on_malformed_response`, `test_company_snapshot_returns_raw_facts_when_llm_unavailable`

### E2E
- [ ] Feature reachable only from the paid surface; free users see the upsell, not the tool — **N/A while shipping free**: there is no paid-vs-free surface split yet by design (everyone has access). Revisit once `CANDIDATE_PREMIUM_ENABLED` is turned on and a real upgrade/upsell UI exists (the 402 response is already there for the frontend to catch and show an upsell once that UI is built).
- [x] **Frontend built (2026-07-08):** `JobPrepPanel` on the job detail page (candidates only) has "Preparar entrevista" / "Carta de apresentação" / "Sobre a empresa" buttons calling the three endpoints, rendering results inline with the `unavailable`/`reason` fallback message shown when the LLM has nothing to return. `tsc`/`vitest` pass; not yet exercised against a live backend from this sandbox.

---

## Point 5 — Propose-then-approve design (already built) — regression only

**Touchpoints:** existing `test_auto_apply_matching.py`,
`test_auto_apply_proposal_endpoints.py`, `test_no_account_apply_tracking.py`.

- [x] **Invariant test — the load-bearing one:** approving a proposal is the *only* path that creates a `JobApplication`; the matcher/sweep never auto-submits. Keep the test that asserts Dismiss creates zero applications — `test_auto_apply_proposal_endpoints.py::test_dismiss_never_creates_an_application` still passes; `_llm_refine_score` (Phase 1) only ever adjusts a score/reasons, never touches `JobApplication`
- [x] All existing auto-apply and no-account-flow tests still pass unchanged after points 1–4 land — `test_auto_apply_matching.py` + `test_auto_apply_proposal_endpoints.py` + `test_no_account_apply_tracking.py` all green together after Phases 0–4 (202 tests total)
- [x] Human-in-the-loop copy stays accurate ("nenhuma candidatura é submetida sem a sua aprovação") — no drift toward "automatic submission" — confirmed still present verbatim in `CV-e-Documentos/page.tsx`, untouched by Phases 0–3

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
