# Feasibility Analysis — Native CV Builder ("one system")

**Decision requested:** replace the embedded Reactive Resume app with a fully
native CV builder inside the Parvagas portal, reconciling it with the
career-ops features (TEST_PLAN_CAREER_OPS.md). This document is the product
owner / business analyst assessment requested before committing.

**Verdict up front: FEASIBLE, and cheaper than it looked — roughly 40% of the
build already exists in this codebase, unused.** The main risk is not backend
work at all; it is (1) the editor UX quality bar and (2) template/PDF
rendering fidelity. Both are manageable with the scoping below.

---

## 1. The discovery that changes everything

While scoping this, I found that a native resume-builder backend **already
half-exists** in `backend-python/`, built at some point and never given a
frontend:

| Already built | Where | State |
|---|---|---|
| `Resume` model (JSON data, draft/published, `share_slug`) | `app/models/__init__.py:191` | Done, migrated |
| `ResumeVersion` (full version history) | `models:210` | Done, migrated |
| `ResumeTemplate` (name/slug/schema/preview) | `models:176` | Done, but **zero templates seeded** |
| `CoverLetter` model | `models:227` | Done, migrated |
| `CandidateScore` (ATS/skills/experience/formatting scores) | `models:245` | Done, migrated |
| `/resumes` CRUD API (list/create/get/patch) | `app/api/v1/resumes.py` | Done, registered, **no frontend calls it** |
| `POST /resumes/score` — AI resume scoring | `resumes.py:230` | Done, wired to billing tiers |
| `POST /resumes/rewrite` — AI rewrite w/ version snapshot | `resumes.py:266` | Done, wired to billing tiers |
| `POST /resumes/cover-letters` | `resumes.py:311` | Done |
| `ResumeAIService` (Ollama free tier / OpenAI-Azure paid) | `app/services/resume_ai_service.py` | Done (282 lines) |
| `CandidateCVSubscription` billing (free/pro/premium, Multicaixa/Unitel/bank ref) | `app/api/v1/payments.py:220-395` | Done, has frontend (`CVBuilderPlanBanner`) |
| PDF + DOCX generation (ATS single-column) | `app/services/cv_export_service.py` | Done, in production use |
| JSON Resume v1 export (schema-complete as of this week) | `cv_export_service.to_json_resume()` | Done |
| Guest shadow-account creation | `/public/resume-sso/guest-start` (this week) | Done, tested |

**What does NOT exist:** the editor frontend (100% missing), visual template
rendering beyond the one ATS layout, the public share page, and
`POST /resumes/export` is a stub that literally returns *"will be implemented
in the next phase"*. This project **is** that next phase.

## 2. What Reactive Resume actually is, feature by feature — and our answer

| RX Resume feature | Do we need it? | Native equivalent |
|---|---|---|
| Section-based editor (basics, work, education, skills, languages, certs, custom) | **Yes — core** | Build. Only genuinely new work. We already have `ExperienceCard`/`EducationCard`/`TagInput`/`AddItemModal` components in the portal (used by CV-e-Documentos) to reuse. |
| Live preview pane | **Yes — core** | Build (HTML/CSS render of `Resume.data` client-side) |
| Multiple visual templates | Yes, but 2-3 not 12 | Seed `ResumeTemplate` rows; render via HTML/CSS |
| PDF export matching preview | **Yes — core** | The one real technical decision (§4) |
| Public share link | Nice-to-have | `share_slug` field already exists; one public page |
| Import existing resume (PDF/LinkedIn/JSON) | Yes | **Already have it, better**: our CV parser (`/cv/parse`, incl. OCR) already extracts profile data — RX Resume's import is weaker than ours |
| AI features (summarize, improve) | Yes | **Already have it**: `/resumes/score`, `/resumes/rewrite`, plus career-ops `inject_job_keywords` |
| Multi-language UI | PT-first, EN later | Our existing i18n system |
| Accounts/auth | — | Ours. This is the whole point: no second identity system |
| Self-host/privacy branding | — | Irrelevant once native |

Features we get natively that RX Resume **cannot** give us: pre-fill from a
live job-board profile, "tailor to this job posting" against real
`requiredSkills`, attach-resume-to-application, auto-apply integration,
AOA-denominated billing through Multicaixa/Unitel rails, and full PT-Angola
localization.

## 3. Reconciliation with TEST_PLAN_CAREER_OPS.md (career-ops features)

The career-ops work this week wasn't a detour — it becomes the intelligence
layer of the builder:

- **Phase 0 (shared `llm_service`)** → becomes the single LLM client.
  *Action: refactor `ResumeAIService` to call `llm_service.chat_json()`
  internally instead of its own HTTP code — one client, two features.*
- **Phase 2 (CV keyword injection, `inject_job_keywords`)** → becomes the
  **"Adaptar a esta vaga"** button inside the editor: pick a saved job, the
  summary/skills get tailored, grounded against the job's real
  `requiredSkills` (anti-hallucination logic already tested).
- **Phase 4 (premium AI: interview prep / cover letter / company snapshot)**
  → interview prep + snapshot stay on the job detail page (`JobPrepPanel`);
  the **cover-letter generator gets rewired to save into the `CoverLetter`
  model** so generated letters appear in the builder. Today there are TWO
  disconnected cover-letter implementations (`/premium/cover-letter`
  generates-and-forgets; `/resumes/cover-letters` stores manual ones) —
  reconciling them is a required cleanup, not optional.
- **Phase 1 (auto-apply LLM scoring)** → future: proposals reference a
  specific `Resume` document ("apply with my Engineering CV") instead of the
  generic profile export.
- **Billing reconciliation (required):** there are TWO candidate billing
  systems — `CandidateCVSubscription` (tiers, working payment flow, already
  gates `/resumes/score|rewrite`) and `CandidateSubscription` +
  `CANDIDATE_PREMIUM_ENABLED` (kill-switch, gates Phase 4 tools). **Recommend
  consolidating on `CandidateCVSubscription` tiers as the single candidate
  monetization surface**, folding Phase 4 premium tools into the pro/premium
  tiers, and keeping everything effectively free until pricing is decided
  (the tier check already treats no-subscription as free tier — consistent
  with the "ship dark" decision made earlier this week). `CandidateSubscription`
  + its flag can then be retired in a later cleanup.

## 4. The one real technical decision: PDF rendering

The preview the candidate sees must match the PDF they download. Options:

1. **Extend `cv_export_service` (reportlab) per template** — no new
   dependencies, but every visual template is hand-coded PDF drawing; slow to
   build, hard to keep pixel-matched with an HTML preview. Fine for MVP's
   single ATS template (it already exists!), bad beyond that.
2. **WeasyPrint (HTML/CSS → PDF in Python)** — one HTML template renders both
   the browser preview and the PDF; no headless browser; pure-Python
   dependency in the existing backend container. **Recommended for Phase B.**
3. **Headless Chromium print-to-PDF** (what RX Resume itself does) — best
   CSS fidelity, but adds a browser container to the stack; overkill here.

MVP ships with option 1 (zero new work — the existing ATS PDF/DOCX *is* the
first template). Phase B introduces WeasyPrint for visual templates.

## 5. Honest accounting: what this week's SSO work becomes

- **Obsoleted:** the OIDC provider endpoints (`/oauth/authorize|token|userinfo`,
  discovery doc, handoff codes) — a native builder needs no SSO into itself.
  ~1 day of work, kept dark (harmless) until a cleanup commit removes them.
- **Survives:** the guest shadow-account flow (simplified: mint account →
  issue a normal Parvagas JWT → open the native builder — no handoff codes
  needed), the JSON Resume schema completeness, the `CVBuilderGuestForm`, and
  all the Phase 0 migration-chain repair.
- **Cancelled entirely (this is the big saving):** Phase 4 fork-and-rebrand
  of Reactive Resume — the largest, riskiest, permanently-maintained piece of
  the old plan. The `cv-builder`, and eventually its Postgres tables and
  Traefik route, get decommissioned. One less container, one less DB schema,
  one less upstream to track.

Pivoting now, before the fork, is the cheapest possible moment to make this
call.

## 6. Business analysis

**Strategic case (strong):**
- **Funnel ownership:** guest builds CV → shadow account → verified account →
  applications → auto-apply. Every step in one product, every step measurable.
  With RX Resume, the builder was a funnel *exit*.
- **Data ownership:** resume documents in our schema feed matching, auto-apply
  scoring, and employer-side search later. In RX Resume's tables they're
  opaque.
- **Monetization:** CV tiers (free/pro/premium) via Multicaixa/Unitel — rails
  that already work in `payments.py` and that no foreign SaaS supports.
  AI features are the natural paywall (score/rewrite/tailor on pro).
- **Differentiation:** "the CV builder that knows the Angolan job market" —
  templates matching local employer expectations, PT-first, tailored to
  actual postings on the board. RX Resume can never be that.

**Costs & risks (named, not hand-waved):**
- **Editor UX bar (top risk):** RX Resume is a polished, years-refined
  editor. Our v1 will be simpler. *Mitigation: position as ATS-first
  simplicity — a focused, guided editor rather than an infinitely
  customizable one. In this market that's a feature; most CVs here get
  parsed by ATS or read by recruiters, not judged on typography.*
- **Maintenance moves fully in-house.** True — but the fork plan already
  forfeited upstream updates, so this costs nothing extra versus the path
  already chosen.
- **PDF fidelity** — bounded by the §4 phasing (MVP reuses the proven
  existing PDF path).
- **Scope creep** — the RX feature table (§2) is the contract: anything not
  in it is out of v1.

**Effort estimate (relative, based on what's genuinely left):**

| Phase | Scope | Relative size |
|---|---|---|
| **A — MVP editor** | Editor UI on the existing `/resumes` API; prefill from `CandidateProfile`; autosave; the existing ATS template as the one export; implement the `/resumes/export` stub by wiring `cv_export_service`; guest flow simplified; retire cv-builder container | The big one — mostly frontend. Backend nearly done. |
| **B — Templates & sharing** | 2-3 WeasyPrint HTML templates; preview=PDF parity; public share page (`share_slug`); versions UI | Medium |
| **C — Intelligence layer** | "Adaptar a esta vaga" (inject_job_keywords) in-editor; score + rewrite buttons; cover-letter generator writes to `CoverLetter`; `ResumeAIService` refactored onto `llm_service`; billing consolidated on `CandidateCVSubscription` | Medium — all pieces exist, work is wiring + reconciliation |
| **D — Ecosystem** | Attach chosen resume to applications; auto-apply proposals reference a resume; employer-side rendering | Medium, later |

Phase A alone replaces Reactive Resume for the core use case. B and C are
where it becomes better than RX Resume, not just equal to it.

## 7. Recommendation

**Proceed with the native rebuild, phased A→D.** Concretely because:
1. The backend is ~40% done and idle — the marginal cost dropped dramatically.
2. It cancels the fork/rebrand, the single most expensive and
   permanently-costly item on the old plan.
3. It's the only path to the stated goal ("truly one system, integrated into
   user portals") — the embed/proxy option was always going to keep a seam.
4. Every career-ops feature slots in as the builder's intelligence layer
   rather than sitting beside it.

**Sequencing advice:** ship Phase A end-to-end (even visually plain) before
touching B/C — a working native editor in the portal is the proof point, and
it immediately unblocks decommissioning the cv-builder container and its
open questions (the OIDC auto-provisioning unknowns simply evaporate).

**Also required in Phase A (hygiene):** seed 1-2 `ResumeTemplate` rows,
reconcile the duplicate cover-letter endpoints, and decide the fate of the
`CandidateSubscription`/`CANDIDATE_PREMIUM_ENABLED` pair (recommend: fold
into CV tiers, retire the flag).
