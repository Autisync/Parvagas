# Execution Plan — Native CV Builder (Phases A→D)

Companion to FEASIBILITY_NATIVE_CV_BUILDER.md (the "why"). This is the "how":
concrete iterations, files, UX specification, tooling, and verification —
written to be executed with `/loop` the same way TEST_PLAN_CAREER_OPS.md was.

---

## 0. How to execute this plan

**Loop protocol** (for `/loop` dynamic self-pacing):
- One iteration per loop cycle. Finish → run the iteration's verification →
  commit with a descriptive message → `ScheduleWakeup` for the next cycle.
- Full gate before every commit: backend
  `pytest tests/ -q` green, `npx tsc --noEmit -p tsconfig.json` clean,
  `npx vitest run` green. UI iterations additionally require the browser
  verification workflow (below).
- **Stop and report** (don't guess) when an iteration hits a product
  decision, a visual-design judgment call bigger than the UX spec in §1
  covers, or a live-environment dependency this sandbox can't satisfy.
  Leave the checklist item unchecked with a one-line reason, exactly like
  TEST_PLAN_CAREER_OPS.md does.
- Keep the checkboxes in this file updated as iterations land — this file is
  the progress ledger.

**Tooling & skills per iteration type:**
- *UI-building iterations (A2-A6, B2, C2-C3):* after implementing, run the
  browser verification workflow — `preview_start` the dev server, drive the
  page with `read_page`/`find`/`computer`, check `read_console_messages`
  for errors, screenshot as proof. On the **final polish pass of each UI
  iteration, invoke the `impeccable` skill** (frontend design/UX audit) on
  the new screens and apply its findings — this is the mechanism for "best
  possible UX", not ad-hoc taste. Use `ui-ux-pro-max` instead if a whole-new
  -screen layout needs generating from scratch.
- *Backend iterations (A1, B1, C1, C4, D1):* pytest with the SQLite
  in-memory fixture pattern (`tests/test_public_cv_submission.py` is the
  reference); never bare `python3` — use the versioned interpreter path.
- *External-fact iterations (B1's Alpine packages):* verify against official
  docs with WebFetch/WebSearch before writing code — never from memory.
  (Already done for WeasyPrint core facts — see B1.)
- *Anything touching `docker-compose.prod.yml` or Dockerfile:* cannot be
  live-verified from this sandbox; mark as "needs deploy verification" and
  list the manual step in the iteration's notes.

---

## 1. UX specification (the contract for every UI iteration)

The product goal: **a first-time job seeker in Luanda on a mid-range phone
finishes a professional CV in under 15 minutes.** Every design decision below
serves that user; desktop power users are the secondary persona.

**Layout — two-pane editor:**
- Desktop: left pane = section editor (forms), right pane = live preview,
  sticky, updating on every change (debounced ~500ms).
- Mobile (the majority of Angolan traffic): single pane with a floating
  "Pré-visualizar" button that slides the preview over as a full-screen
  sheet; never side-by-side squeezed.

**Guided, not free-form:**
- Sections presented as a checklist rail: Dados Pessoais → Resumo →
  Experiência → Educação → Competências → Idiomas → Certificações →
  (Extras). Each shows a completeness state (empty / partial / done).
- A single **completeness meter** ("O seu CV está 70% completo") with the
  next best action ("Adicione pelo menos uma experiência"). This gamifies
  progress and is the single most effective easiness lever.
- Smart defaults: on first open, the editor is **pre-filled from
  CandidateProfile** (or from a parsed CV upload) — the user edits, never
  starts from blank. Blank-canvas is the #1 abandonment cause in this
  category.
- Every section supports "add another" cards with drag-to-reorder
  (dnd via keyboard-accessible buttons too — up/down arrows on each card,
  not drag-only).

**Never lose work:**
- Autosave on every field blur + 10s debounce (PATCH `/resumes/{id}`),
  with a subtle "Guardado ✓ há instantes" indicator. No Save button as the
  primary interaction (keep one anyway for user trust).
- Versions are snapshotted automatically before AI rewrites (backend
  already does this) and manually via "Guardar versão".

**Language & tone:** PT-Angola first, same dictionary system as the rest of
the portal. Microcopy guides ("Descreva o que fez, começando com um verbo:
'Geri uma equipa de 5…'"). Placeholder examples use local names/companies.

**Performance/robustness:** editor must work on a flaky connection —
autosave failures queue and retry, never block typing; the preview renders
client-side (no server round-trip per keystroke).

**Accessibility floor:** all interactive elements keyboard-reachable,
labels on every input, focus states visible, contrast per the existing
design system (red-600 primary on white).

---

## Phase A — MVP native editor (replaces Reactive Resume for the core case)

### A1 — Backend hardening of the existing `/resumes` API ✅ done
- [x] Seeded 2 `ResumeTemplate` rows via migration `20260712_0028`:
      `ats-classic` and `moderno` (placeholder until Phase B renders it).
- [x] Replaced the `POST /resumes/export` stub with a real
      `GET /resumes/{resume_id}/export?format=pdf|docx|json` (matches the
      existing `/candidates/cv/export` GET pattern) — zero new rendering
      code, reuses `to_pdf`/`to_docx`/`to_json_resume` directly.
- [x] Added `DELETE /resumes/{id}` and `POST /resumes/{id}/duplicate`.
- [x] Added `from_profile` to `ResumeCreateRequest`: when true, `Resume.data`
      is initialized via a new local `_profile_to_resume_data()` helper
      (mirrors the dict already built in candidates.py's `/cv/export`,
      not `_profile_to_payload` — that one carries profile-only fields
      like onboarding flags that don't belong in a resume document).
- [x] Canonical `Resume.data` shape documented in the module docstring:
      deliberately identical to the flat profile dict `cv_export_service`
      already consumes — no translation layer needed for export.
- [x] Found and fixed a real pre-existing bug while in this file: `GET
      /matches` was registered *after* `GET /{resume_id}`, so Starlette
      matched the dynamic route first (`resume_id="matches"`) and the
      endpoint was permanently unreachable. Reordered; added a routing
      regression test.
- [x] Tests: `tests/test_resumes_api.py` (14 tests) — CRUD, ownership
      isolation, from-profile init (+ explicit data ignored when
      from_profile=true), duplicate, delete-cascades-versions, export
      pdf/docx/json + 404 + empty-data, route-ordering regression.
      Full suite green (backend 265), tsc clean.

### A2 — Editor shell & routing
- [ ] New route `src/app/Portal/Candidato/Construtor-CV/page.tsx`:
      "Os meus CVs" list (cards: title, template, updatedAt, completeness,
      actions: editar/duplicar/exportar/eliminar) + "Criar novo CV" (choice:
      "A partir do meu perfil" | "Do zero").
- [ ] New route `.../Construtor-CV/[id]/page.tsx`: the editor shell —
      section rail, editor pane, preview pane, autosave plumbing
      (reuse `authFetch`; debounce util).
- [ ] Portal nav: add "Construtor de CV" to the candidate sidebar
      (replacing the external-link behavior inside the portal).
- [ ] Verify: browser workflow — list renders, create→edit→autosave
      round-trip visible in network tab, zero console errors.

### A3 — Section editors
- [ ] Dados Pessoais + Resumo (reuse field patterns from CV-e-Documentos).
- [ ] Experiência + Educação: reuse/extend the existing `ExperienceCard`
      / `EducationCard` components (src/app/components/profile/) — add
      reorder buttons.
- [ ] Competências (reuse `TagInput` with the hard/techniques/tools
      buckets), Idiomas, Certificações.
- [ ] Completeness meter + per-section state chips per UX spec §1.
- [ ] Verify: browser workflow + `impeccable` pass on the editor.

### A4 — Live preview (client-side)
- [ ] `src/app/Portal/Candidato/Construtor-CV/preview/AtsClassic.tsx`:
      HTML/CSS render of `Resume.data` matching the cv_export_service ATS
      layout closely (it won't be pixel-identical to reportlab output in
      Phase A — acceptable; note in UI: "pré-visualização aproximada").
- [ ] Mobile behavior per UX spec (full-screen preview sheet).
- [ ] Verify: browser workflow at desktop + mobile viewport
      (`resize_window` preset mobile), `impeccable` pass.

### A5 — Export & guest simplification
- [ ] Wire export buttons (PDF/DOCX/JSON) in editor + list to
      `POST /resumes/export` (blob download, same pattern as
      CV-e-Documentos handleExport).
- [ ] Simplify guest flow: `/public/resume-sso/guest-start` returns a
      normal Parvagas JWT (same response shape as login) instead of an SSO
      handoff code; `CVBuilderGuestForm` stores it via `setToken`/`setUser`
      and routes to `/Portal/Candidato/Construtor-CV` directly. Update
      `tests/test_resume_sso_guest.py`.
- [ ] `buildResumeBuilderSsoUrl` + the three entry links point at the
      native route now (logged-in: straight to the route; guests from
      Header/homepage: to /Submission's guest form).
- [ ] Verify: full guest journey in browser (form → lands in editor).

### A6 — Polish & i18n pass
- [ ] All strings through the dictionary system (PT primary, EN entries).
- [ ] Empty states, loading skeletons, error toasts (reuse AppNotifier).
- [ ] Final `impeccable` audit across all builder screens; fix findings.
- [ ] Update MANUAL_TEST_GUIDE.md with a "Construtor de CV nativo" section.

### A7 — Decommission Reactive Resume (deploy-time; manual steps flagged)
- [ ] Remove the `cv-builder` service + OAUTH_* env from
      docker-compose.prod.yml (needs deploy verification on server).
- [ ] Mark the OIDC endpoints deprecated (keep dark one release, then a
      cleanup commit removes resume_sso OIDC routes + tables via migration;
      guest-start stays, it's now JWT-based).
- [ ] Traefik: cv.parvagas.pt router → 301 redirect to
      parvagas.pt/Portal/Candidato/Construtor-CV (server-side manual step;
      document in TRAEFIK_FIX_GUIDE.md style).

**Phase A exit criterion:** a candidate (or guest) creates, edits, previews,
and downloads a CV entirely inside the portal; cv-builder container retired.

---

## Phase B — Visual templates via WeasyPrint

### B1 — WeasyPrint integration (backend)
- [ ] Add `weasyprint` (v69.x, current stable — verified against official
      docs 2026-07) to `backend-python/requirements.txt`.
- [ ] Dockerfile (**Alpine** — note: WeasyPrint's docs cover Debian
      (`libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0`); the Alpine
      equivalents are `pango fontconfig` + a real font package
      (`ttf-dejavu` or `font-noto`). **Verify exact apk names against
      WeasyPrint docs/Alpine package index at implementation time**; if
      Alpine fights back, the documented fallback is switching the runtime
      stage to `python:3.12-slim` and using the verified Debian packages —
      a contained, single-file change.)
- [ ] `app/services/resume_render_service.py`: Jinja2 HTML template +
      shared CSS per template slug → `weasyprint.HTML(string=...).write_pdf()`.
      Contract: **the same HTML/CSS file pair drives both the frontend
      preview and the PDF** (frontend fetches the rendered HTML via a new
      `GET /resumes/{id}/preview.html`, iframe-embedded) — this is what
      guarantees preview=PDF parity from Phase B on.
- [ ] Guard: WeasyPrint import behind a feature check; if unavailable,
      `/resumes/export` falls back to the Phase A reportlab path (ship-dark
      pattern — never 500 on a rendering dependency).
- [ ] Tests: render service produces a non-empty PDF for a full and an
      empty Resume.data; template slug routing; fallback path.

### B2 — Two visual templates + picker
- [ ] `moderno` (single column, accent color, sans) and `executivo`
      (two-column sidebar) as Jinja2+CSS pairs; seed rows updated with
      real `preview_url` thumbnails.
- [ ] Template picker in the editor (thumbnail cards, instant preview
      switch); `impeccable` pass.
- [ ] A4 print-correctness: margins, page-break rules
      (`break-inside: avoid` on cards), 2+ page CVs paginate cleanly.

### B3 — Public share page
- [ ] `GET /public/resumes/{share_slug}` (backend, only `is_published`)
      + `src/app/cv/[slug]/page.tsx` public render + "Partilhar" toggle in
      editor (generates slug, copy-link button).
- [ ] Verify: unpublished slug 404s; published renders without auth.

### B4 — Versions UI
- [ ] Version history panel (list `ResumeVersion` rows, view snapshot,
      restore-as-copy). Backend list/restore endpoints if missing.

---

## Phase C — Intelligence layer + billing consolidation

### C1 — One LLM client
- [ ] Refactor `ResumeAIService` internals onto `llm_service.chat_json()`
      (keep its public API + free/paid tier routing). Delete its bespoke
      HTTP code. Tests keep passing unchanged — that's the refactor gate.

### C2 — In-editor AI actions
- [ ] "Adaptar a esta vaga": job picker (saved jobs, reuse the
      CV-e-Documentos selector) → `inject_job_keywords` applied to
      `Resume.data` as a **new version** (never destructive) with a diff
      summary shown. Grounding rules already tested — reuse, don't rewrite.
- [ ] "Avaliar CV" (score) + "Melhorar texto" (rewrite) buttons wired to
      the existing endpoints; results rendered as actionable panels
      (score breakdown with next-step hints, not bare numbers).
- [ ] Verify: browser workflow with flags off (buttons degrade gracefully
      to "indisponível") — live-LLM verification flagged for deploy.

### C3 — Cover letters reconciled
- [ ] `/premium/cover-letter` (candidates.py) saves generated letters into
      the `CoverLetter` model; builder gets a "Cartas" tab listing them
      (view/edit/delete/export via existing `to_pdf`-style rendering).
- [ ] Deprecate the divergence: one generation path, one storage model.

### C4 — Billing consolidation (product decision checkpoint — confirm before executing)
- [ ] Gate Phase 4 premium tools (interview prep/snapshot/cover letter) by
      `CandidateCVSubscription` tier instead of
      `CANDIDATE_PREMIUM_ENABLED`; no-subscription = free tier = full
      access until pricing is set (preserves the standing "ship free"
      decision).
- [ ] Retire `CandidateSubscription` + `candidate_billing_service` + flag
      (migration drops table after a dark release).
- [ ] Update .env.example + MANUAL_TEST_GUIDE.md accordingly.

### C5 — Guest→member conversion nudges
- [ ] Post-export prompt for guest-created accounts: "Defina uma
      palavra-passe para guardar este CV" → existing forgot-password flow.
- [ ] Email (existing EmailService pattern): "O seu CV está guardado" with
      claim link. Rate-limited, one per account.

---

## Phase D — Ecosystem integration

### D1 — Apply with a chosen CV
- [ ] `JobApplication.resume_id` (nullable FK, migration); apply flow
      offers "Candidatar com: [CV picker|perfil padrão]"; employer-side
      application view renders/downloads that resume's PDF.
### D2 — Auto-apply uses documents
- [ ] `JobMatchProposal` carries a suggested resume (default: the one
      matching the job's category, else newest); approval creates the
      application with that `resume_id`.
### D3 — Analytics
- [ ] Track (existing `track()`/analytics pattern): builder_opened,
      section_completed, cv_exported, template_changed, ai_action_used,
      guest_converted. These are the funnel KPIs from the feasibility doc.

---

## Standing conventions (apply to every iteration)
- Migrations: sequential `YYYYMMDD_NNNN_*.py`, chain off the current single
  head, `sa.inspect` guards, keep `test_migrations.py` green.
- Feature flags default OFF for anything touching live LLM or new
  rendering paths; graceful fallback always.
- Commit per iteration; push only when explicitly asked.
- This file is the ledger: tick boxes with the verifying test/file name,
  leave honest unchecked items with reasons.
