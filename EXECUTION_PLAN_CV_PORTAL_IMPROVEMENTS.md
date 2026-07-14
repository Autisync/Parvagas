# Execution Plan — CV Builder & Candidate Portal Improvements

Requested 2026-07-14. Each item below was verified against the actual codebase
before planning (file/line references are real, not guessed). Items are ordered
so that shared groundwork lands before the things that depend on it. Every item
ends with its own verification step; run the full suites
(`python3 -m pytest`, `npx vitest run`, `npx tsc --noEmit`) after each phase.

---

## Item 1 — PDF download must match the shared-link look (not default to ATS)

**Verified root cause.** Two independent gaps:

1. `RESUME_WEASYPRINT_ENABLED` defaults to `false`
   ([app/core/config.py:148](backend-python/app/core/config.py)) and is set in
   **neither** docker-compose.dev.yml nor docker-compose.prod.yml. So
   `export_resume` ([app/api/v1/resumes.py](backend-python/app/api/v1/resumes.py),
   `GET /{resume_id}/export`) always skips the templated
   `resume_render_service.render_pdf(data, template_slug)` branch and falls
   through to `to_pdf()` — the reportlab Phase-A renderer that only knows the
   ATS look. Meanwhile the share page (`src/app/cv/[slug]/page.tsx`) renders
   `<ResumePreview templateSlug={...}>` with the chosen template. That's the
   exact mismatch reported.
2. Even with the flag on, WeasyPrint failures silently fall back to `to_pdf()`
   (deliberate ship-dark guarantee) — fine to keep, but the fallback should log
   loudly enough to notice drift in production.

**Plan:**
- [ ] Add `RESUME_WEASYPRINT_ENABLED: "true"` to the backend env block of
      `docker-compose.dev.yml` AND `docker-compose.prod.yml`. The runtime deps
      (pango/harfbuzz/fontconfig + DejaVu) are already in the Dockerfile
      (verified — installed for exactly this), and `weasyprint==69.0` is in
      requirements.txt, so this is config-only.
- [ ] Smoke-test on dev: create a resume with template `moderno`, download PDF,
      confirm it visually matches the share page. Repeat for `executivo` and
      `ats-classic`.
- [ ] DOCX/JSON exports are structurally template-less — acceptable; only PDF
      must match. Note this in the export buttons' tooltips if worth surfacing.
- [ ] Keep the reportlab fallback, but raise its log from `warning` to `error`
      so a broken template shows up in monitoring instead of silently shipping
      ATS-look PDFs again.

**Effort:** S (config + verification). **Risk:** WeasyPrint cold-start memory on
the small dev host — watch the container after first render.

---

## Item 2 — Share link on the resume card when published

**Verified gap.** The list endpoint's `ResumeSummary` payload and the card UI
(`src/app/Portal/Candidato/Construtor-CV/page.tsx`) don't include `share_slug`
at all — the card knows `is_published` (renders the "Publicado" badge) but has
no link to show.

**Plan:**
- [ ] Backend: include `share_slug` in the list serializer used by
      `GET /resumes/` (it's already on the model and in the detail payload).
- [ ] Frontend: on published cards, render a link row at the bottom of the card:
      the public URL (`{SITE_URL}/cv/{share_slug}`) with a copy-to-clipboard
      button (reuse the existing "Ligação copiada." notify pattern from the
      editor's share panel) and an "abrir" external-link icon.
- [ ] Unpublished cards: nothing (don't tease a link that 404s).

**Effort:** S.

---

## Item 3 — "Aplicar ao perfil" — sync a built CV back to the profile

**Verified context.** `_profile_to_resume_data()`
([app/api/v1/resumes.py:121](backend-python/app/api/v1/resumes.py)) already maps
CandidateProfile → Resume.data ("A partir do meu perfil"). The reverse mapper
does not exist. CandidateProfile stores the same concepts as Resume.data
(`professional_summary`, `hard_skills`/`techniques`/`tools` as JSON strings,
`work_experience`, `education` — verified in models). So a clean inverse is
possible with zero schema changes.

**Plan:**
- [ ] Backend: `POST /resumes/{resume_id}/apply-to-profile` — new endpoint that
      maps Resume.data → CandidateProfile fields (the inverse of
      `_profile_to_resume_data`). Rules:
      - Only overwrite a profile field when the resume actually has content for
        it (never blank out profile data from an emptier CV).
      - Recompute `completionScore` afterwards (reuse whatever
        `/candidates/profile` uses).
      - Return a diff summary (`{updatedFields: [...]}`) so the UI can say what
        changed.
- [ ] Also attach the rendered PDF as the profile's CV document: generate the
      PDF (same path as Item 1) and store via StorageService, updating
      `cv_file_path` — so "Meu Perfil"/applications see the built CV without
      the manual download→upload round-trip the user described.
      **Memory note:** `cv_file_path` is a `server:<key>` MinIO ref, not a
      local path — write through StorageService, never a raw filesystem path.
- [ ] Frontend: "Aplicar ao perfil" action on the resume card (and in the
      editor's top bar). Confirmation dialog listing what will be updated
      (this overwrites profile data — must be explicit, not silent).
      Keep the download buttons as-is.
- [ ] Tests: round-trip test — profile → resume → mutate → apply-to-profile →
      assert profile fields; plus never-blank-out rule.

**Effort:** M. **Risk:** silent data loss if the overwrite rules are wrong —
the confirmation dialog + never-blank-out rule are the guardrails.

---

## Item 4 — Configurar Perfil vs Construtor de CV: overlap analysis (decision needed)

**Analysis.** Today there are three places a candidate enters the same data:

| Surface | Purpose | Storage |
|---|---|---|
| Onboarding wizard (`Configurar Perfil`, 7 steps) | First-run profile capture | CandidateProfile |
| Meu Perfil / CV-e-Documentos | Ongoing profile editing | CandidateProfile |
| Construtor de CV | Building presentable CV documents | Resume.data (per-CV copies) |

They are **not** doing the same thing, and merging them fully would be wrong:
the profile is the *single canonical identity* (feeds matching, auto-apply,
recruiter views); resumes are *purpose-built documents* (tailored per
application, multiple versions, published/shared). The industry pattern
(LinkedIn profile vs. exported resume; Reactive Resume's profile vs documents)
keeps them separate but **one-directionally synced with explicit actions**.

**Recommended approach (not a merge):**
- Profile = source of truth. Builder = derivative documents.
- Keep both flows, but make the bridge explicit and bidirectional-on-demand:
  - profile → resume: already exists ("A partir do meu perfil").
  - resume → profile: Item 3's "Aplicar ao perfil".
- Kill the *entry duplication*, not the surfaces: the Onboarding wizard's
  Experience/Education/Skills steps and the builder's section editors should
  share the same components (`ExperienceCard`, `EducationCard`, `TagInput`
  already exist and are shared — verify remaining divergence and converge).
- Add a freshness nudge: when the profile changed after a resume was created,
  show "O seu perfil mudou desde que criou este CV — atualizar?" on the
  resume card (compare `profile.updated_at > resume.updated_at`).

**Plan:**
- [ ] Confirm the recommendation above with the owner (this section IS the
      business analysis — no code until approved).
- [ ] If approved: implement the freshness nudge + component convergence audit
      as a follow-up ticket; Items 3 and 5 already cover the rest.

**Effort:** analysis done; nudge is S.

---

## Item 5 — Onboarding/profile-setup prompts only on first login + real guidance

**Verified mechanics.** `OnboardingGuard`
([src/app/Portal/Candidato/components/OnboardingGuard.tsx](src/app/Portal/Candidato/components/OnboardingGuard.tsx))
decides from `getUser()` — i.e. the **localStorage snapshot taken at login**,
not live data. Backend persists `has_seen_tutorial` / `has_completed_onboarding`
on CandidateProfile correctly (candidates.py:350,370), and login/build_user_response
returns them. Failure mode: any login path or client flow that stores a stale
user object (e.g. Google sign-in response raced before profile flags, or the
flags updated server-side in another tab/session) re-triggers the prompts.

**Plan:**
- [ ] Make the guard trust the server, not the snapshot: on mount, if the
      snapshot says tutorial/onboarding is pending, first re-fetch
      `/candidates/profile` (cheap, already exists, returns both flags) and
      only then decide. Update localStorage with the fresh flags. This kills
      every "shows again on every login" variant in one move, for all login
      paths (password, Google, invite).
- [ ] Audit the three write-paths (`complete-onboarding`, `seen-tutorial`
      endpoints, and wizard completion) to confirm the frontend updates the
      localStorage user object immediately after each — patch any that don't.
- [ ] Improve the tutorial to guide rather than describe: the current
      `TutorialModal` is 6 static slides. Convert the final slide CTAs into
      deep-links with a checklist the user can act on: "Criar o seu CV" →
      Construtor-CV, "Definir alertas" → Alertas, "Completar perfil" →
      Onboarding wizard. Persist checklist progress client-side; show it on the
      Dashboard as "Primeiros passos (2/4)" until all done, then it disappears
      forever (flag on profile or localStorage).
- [ ] Verify with a fresh account on dev: prompts appear exactly once; logging
      out/in does not re-trigger; `?tutorial=1` replay still works.

**Effort:** M.

---

## Item 6 — Scrape at least 5 real Angola jobs

**Verified mechanics.** The scraper is adapter-based and driven entirely by the
`SCRAPER_SOURCES` env JSON ([scraper_service.py](backend-python/app/services/scraper_service.py):
JSONFeed/RSS/Greenhouse/Lever/Careerjet adapters) — and `SCRAPER_SOURCES` is
currently set in **neither** compose file, so the Celery task no-ops
("no SCRAPER_SOURCES configured"). Scraped jobs land in ScrapedJob for admin
review (quality gate + Segurança-style review flow already built).

**Plan:**
- [ ] Configure `SCRAPER_SOURCES` in docker-compose.dev.yml with working
      Angola sources. Candidates to validate first (adapters exist for all):
      - Careerjet Angola (`CareerjetAdapter` is already written and
        "verified-and-ready" per its docstring — needs the partner key env).
      - RSS feeds from Angolan job boards (jobartis.com, angoemprego.com if
        it exposes RSS — validate with curl before configuring).
- [ ] Trigger `scrape_external_jobs` once (celery worker container:
      `celery -A app.workers.celery_app call app.workers.tasks.scrape_external_jobs`).
- [ ] Review + publish ≥5 jobs through the admin review flow (quality gate
      applies) — publishing is an admin action, keep it manual.
- [ ] If no source yields 5 real jobs, fall back to seeding 5 curated real
      Angola vacancies via the admin "create scraped job" endpoint
      (permission `admin.scrapedJobs.create` exists) — clearly marked source.

**Effort:** S–M (dominated by source validation). **Note:** respect robots.txt /
polite headers — the adapter base class already sends them.

---

## Item 7 — Lottie animations (empty states, success, milestones)

**Verified.** No lottie dependency in package.json today.

**Plan:**
- [ ] Add `lottie-react` (maintained, ~40KB gzip core). Render via a single
      shared `<LottieBlock>` wrapper so usage is uniform: lazy-loaded
      (`next/dynamic`, no SSR), `prefers-reduced-motion` → static first frame,
      one place to size/govern it.
- [ ] **Self-host the JSON files** in `public/lottie/` — do NOT hotlink
      lottiefiles.com CDN (CSP `script-src`/`connect-src` is strict, and the
      dev/prod CSP already bit us this week). Pick free-license animations and
      record attribution in `public/lottie/CREDITS.md`.
- [ ] Rollout, deliberately small (tasteful > everywhere):
      1. Empty states: Construtor-CV "Ainda não tem nenhum CV", CV-e-Documentos
         empty list, Candidaturas empty, Vagas-Guardadas empty.
      2. Success moments: CV published, candidatura submetida, onboarding
         wizard completion.
      3. Milestone: profile completion reaching 100% (Dashboard card).
- [ ] Keep JSONs < 100KB each; verify bundle impact with `next build` output.

**Effort:** M. **Risk:** visual noise — cap at the list above; no loaders/spinners
replacement (existing skeletons are fine).

---

## Item 8 — CV e Documentos: de-AI-ify the front + consistent error styles

**Verified.** The page is a 1,611-line single-file component
(`src/app/Portal/Candidato/CV-e-Documentos/page.tsx`) — the "built by AI" tells
are the monolith structure, repeated inline patterns, and mixed error surfaces.
`react-hook-form` is NOT installed. The codebase already has a consolidated
error-tone system (`toneStyles.ts`, `FeedbackAlert`, `BannerError`, toast tones
— built in tasks #69–72).

**Decision:** do NOT introduce react-hook-form for this one page. Adding a
second form paradigm to a codebase that manages state with useState everywhere
*increases* inconsistency (the stated problem). Instead:

- [ ] Split the monolith into section components (upload card, parsed-fields
      form, auto-apply prefs, documents list) under
      `CV-e-Documentos/components/` — same state flow, readable units.
- [ ] Error consistency sweep: every validation error renders through the
      existing `FeedbackAlert`/inline-field pattern with `toneStyles` tones —
      no ad-hoc red text, no browser-default validation popups, focus moves to
      first invalid field on submit (pattern already exists in Login — reuse).
- [ ] Copy pass: replace generic AI-ish microcopy ("Gerencie os seus
      documentos de forma eficiente" style filler) with specific, short PT
      copy; remove redundant explainer paragraphs; tighten headings.
- [ ] Visual pass: align spacing/border/radius tokens with Meu-Perfil (the
      best-looking sibling page) so the two read as one product.
- [ ] If RHF is still wanted later, adopt it codebase-wide in its own project,
      not one page at a time.

**Effort:** M–L (mostly careful refactor). **Test:** vitest snapshot of the new
components' error rendering + manual pass.

---

## Item 9 — Skills/competencies autocomplete in the CV builder

**Verified root cause.** `TagInput` already supports a `suggestions` prop
(filtering + dropdown built in), and curated catalogs
(`SKILL_SUGGESTIONS`, `LANGUAGE_SUGGESTIONS`, `CERT_SUGGESTIONS`) already exist —
but they're **duplicated privately** inside Meu-Perfil/page.tsx and
CV-e-Documentos/page.tsx, and the builder editor
(`Construtor-CV/[id]/page.tsx`, 5 TagInput usages) passes no suggestions at all.

**Plan:**
- [ ] Extract the catalogs to `src/lib/suggestionCatalogs.ts` (single source;
      dedupe the two existing copies against each other first — they may have
      drifted).
- [ ] Pass the right catalog to each of the builder's 5 TagInputs
      (hardSkills/techniques/tools → skills catalog split appropriately;
      idiomas → languages; certificações → certs).
- [ ] Bonus (cheap, high value): merge the user's own profile values into the
      suggestions for their session (they typed them once already), profile
      values first.
- [ ] Update Meu-Perfil and CV-e-Documentos to import from the shared module.

**Effort:** S.

---

## Suggested execution order

| Phase | Items | Why this order |
|---|---|---|
| 1 | 1, 2, 9 | Small, independent, immediately visible wins |
| 2 | 5, 3 | Onboarding gating first (touches auth/user-flags), then profile sync (reuses fresh-profile fetch from 5) |
| 3 | 6 | Independent ops work; can run parallel to any phase |
| 4 | 8, 7 | The big refactor last, Lottie after it (animations land in the refactored components, not the monolith) |
| 5 | 4 | Decision item — needs owner sign-off before its (small) code lands |

Each phase: implement → full suites green → deploy to dev stack → manual
verification on dev.parvagas.pt → commit/push (one commit per item).
