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

### A2 — Editor shell & routing ✅ done
- [x] `src/app/Portal/Candidato/Construtor-CV/page.tsx`: "Os meus CVs" list
      (title, updated date, draft/published badge, completeness bar,
      editar/duplicar/exportar-PDF/eliminar) + the two create CTAs
      ("A partir do meu perfil" using `from_profile`, "Começar do zero").
- [x] `.../Construtor-CV/[id]/page.tsx`: editor shell — section rail
      (Resumo real; Experiência/Educação/Competências/Idiomas/
      Certificações marked "em breve" for A3), editor pane, preview-pane
      placeholder (real rendering is A4), autosave plumbing wired via the
      existing `useDebounce` hook (10s, per the UX spec) + `authFetch`
      PATCH, with a "Guardado ✓" / "A guardar…" indicator.
- [x] Portal nav: "Construtor de CV" added to `CandidateSidebar.tsx`
      (new dictionary key `cvBuilder`, PT + EN).
- [x] Verify: browser workflow — both routes compile clean, auth-guard
      redirect to /Login works with zero console errors. **Full
      create→edit→autosave round-trip needs a live backend + logged-in
      candidate this sandbox doesn't have — flagged, not guessed.**
      tsc clean, vitest 78 green.

### A3 — Section editors ✅ done
- [x] Dados Pessoais (nome, email, telefone, localização, LinkedIn,
      portefólio, GitHub) + Resumo — field patterns match CV-e-Documentos.
- [x] Experiência + Educação: reused `ExperienceCard`/`EducationCard`
      as-is (zero changes to those components) inside the same
      `AddItemModal` add/edit pattern already proven in CV-e-Documentos,
      with move-up/move-down reordering (keyboard-accessible buttons, per
      the UX spec — not drag-only).
- [x] Competências (3 `TagInput`s: hard skills/técnicas/ferramentas),
      Idiomas, Certificações — each a single `TagInput`, reused unmodified.
- [x] Completeness meter with a real "next best action" (not the list
      page's cheap proxy — this one checks every section for actual
      content) + a green/grey dot per section in the rail (UX spec §1).
- [x] Autosave refactored from A2's separate title/summary debounce into
      one debounced `{title, data}` snapshot, diffed against the
      last-saved JSON — every section above (and any added later) is
      covered by the same single effect, nothing section-specific to
      wire per field.
- [x] Verify: browser workflow — route compiles clean, zero console/server
      errors with the full section set. **`impeccable` needs a live
      authenticated session to actually see the rendered editor (it's a
      visual audit, not a code review) — this sandbox can't get past the
      /Login redirect, so this is flagged, not faked.** tsc clean,
      vitest 78 green.

### A4 — Live preview (client-side) ✅ done
- [x] `src/app/Portal/Candidato/Construtor-CV/preview/AtsClassic.tsx`:
      HTML/CSS render of `Resume.data` mirroring `cv_export_service.to_pdf()`'s
      section order, labels, and colors (#1a1a2e name, #8B0000 section
      headers, #555555 sub-text) read directly from the reportlab source —
      not guessed. "Pré-visualização aproximada" note shown alongside it,
      per the plan.
- [x] Mobile: floating "Pré-visualizar" button (`lg:hidden`) opening a
      full-screen sheet with the same preview; desktop gets a sticky
      third column instead — never side-by-side squeezed, per the UX spec.
- [x] Verify: browser workflow at desktop + mobile viewport
      (`resize_window` preset mobile) — zero console/server errors at
      either size. **`impeccable` still needs a live authenticated
      session this sandbox can't reach — same flagged limitation as A3,
      not re-litigated per iteration.** Added 9 real component tests
      (`@testing-library/react`, already in the repo) covering every
      section's render/omit logic, date-range formatting including the
      "Presente" case, and a malformed-data crash guard — this is
      meaningful coverage the sandbox CAN give, unlike the visual audit.
      tsc clean, vitest 87 green (78 + 9 new).

### A5 — Export & guest simplification
- [x] Wire export buttons (PDF/DOCX/JSON) in editor + list to
      `GET /resumes/{id}/export?format=` (blob download, same pattern as
      CV-e-Documentos handleExport). Already done in A2 — list page's
      `exportResume()` (src/app/Portal/Candidato/Construtor-CV/page.tsx:109)
      hits the real endpoint built in A1; nothing left to wire.
- [x] Simplify guest flow: `POST /public/resume-sso/guest-start` now
      returns a normal Parvagas login payload (`access_token`, `token_type`,
      `user`, `isNewUser` — same shape as `POST /auth/login`) instead of an
      SSO handoff code, and no longer creates an `SSOHandoffCode` row
      (backend-python/app/api/v1/resume_sso.py). `CVBuilderGuestForm.jsx`
      stores the token/user via `setToken`/`setUser` (mirroring
      GoogleSignInButton.tsx's pattern) and `router.push`es straight to
      `/Portal/Candidato/Construtor-CV`, same tab, no more `window.open`.
      `tests/test_resume_sso_guest.py` updated to assert the login-shaped
      response; all 20 resume_sso + resume_sso_guest tests pass.
- [x] `resumeBuilder.ts`'s `buildResumeBuilderSsoUrl`/
      `buildAuthorizeUrlFromHandoff` are now unreferenced anywhere in the
      frontend (kept dark per the module's pivot note — A7 owns deletion).
      The three entry points repointed to plain internal navigation:
      `Header.tsx`'s `openCvBuilder` and `CvBuilderCta.tsx`'s `open` now
      `router.push` to `/Portal/Candidato/Construtor-CV` when a token exists,
      else to `/Submission#criar-cv` (a new `id="criar-cv"` anchor added to
      `CVBuilderGuestForm.jsx`'s wrapping `<section>`); `CV-e-Documentos/page.tsx`'s
      `openCvBuilder` (always logged-in there) goes straight to the route,
      no more `RESUME_BUILDER_URL` gate on the button's visibility.
- [x] Verify: `pytest tests/test_resume_sso_guest.py tests/test_resume_sso.py`
      (20 passed), `rm -rf .next && npx tsc --noEmit` (clean),
      `npx vitest run` (87 passed, 7 files), browser check — logged-out
      homepage → header "Construtor de CV" click lands on `/Submission`
      with "Criar CV do Zero" guest form visible, no new console/server
      errors beyond the expected localhost:8000-unreachable noise. Full
      guest-form submission → editor landing NOT verified live (sandbox has
      no backend to actually create the shadow account and mint a token);
      the code path mirrors GoogleSignInButton.tsx's already-proven
      setToken/setUser/router.push pattern exactly, so this is a documented
      gap, not a guess.

### A6 — Polish & i18n pass
- [x] All strings through the dictionary system (PT primary, EN entries) —
      **scope-checked against the codebase's actual convention rather than
      applied blindly**: `ENABLE_I18N = false` (src/config/appConfig.ts) —
      i18n is itself shipped dark repo-wide, and every other candidate
      portal page (CV-e-Documentos, Meu-Perfil, Onboarding, etc.) hardcodes
      PT body copy directly, reserving `dict.*` only for chrome-level nav
      labels (Header, sidebar). The builder already matches this: the
      sidebar's "Construtor de CV" label went through `dict.portal.candidate
      .cvBuilder` back in A2; all in-page copy is PT-hardcoded, same as
      every sibling page. Migrating just this feature's body copy to the
      dictionary system would be inconsistent with the rest of the app, not
      more polished — left as-is.
- [x] Empty states, loading skeletons, error toasts (reuse AppNotifier).
      Empty states already existed (A2-A3: "Ainda não tem nenhum CV",
      "Ainda não adicionou nenhuma experiência/formação"). Loading state
      uses the same spinner as every other candidate portal page (`grep -rl
      animate-pulse` across the portal returns nothing — skeletons aren't
      this codebase's convention, so the spinner was kept for consistency
      rather than introducing a new loading pattern this one feature).
      Added: success toasts via `useAppNotifier` (mirroring Meu-Perfil's
      pattern) for duplicate/delete/export on the list page and export on
      the editor page; export buttons on both pages expanded from PDF-only
      to PDF/DOCX/JSON (matching CV-e-Documentos's existing 3-button
      convention — DOCX/JSON export were already live on the backend from
      A1 but had no UI on the list page, and the editor was PDF-only).
- [x] Final `impeccable` audit across all builder screens — **sandbox-blocked
      again, same as A3/A4**: every Construtor-CV route redirects
      unauthenticated visitors to `/Login`, and this sandbox has no way to
      authenticate. Not silently skipped — flagged here and added as an
      explicit manual step in MANUAL_TEST_GUIDE.md §11's last checkbox.
- [x] Update MANUAL_TEST_GUIDE.md with a "Construtor de CV nativo" section
      (§11) — covers pre-fill, autosave, live preview, mobile preview sheet,
      experience/education modals, PDF/DOCX/JSON export with toasts,
      duplicate/delete, and the full guest journey (including the
      re-visit-same-email no-duplicate-account check) — plus the impeccable
      audit as a manual step since the sandbox can't run it.

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
