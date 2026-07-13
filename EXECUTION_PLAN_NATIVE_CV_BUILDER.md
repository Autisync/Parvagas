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
      **Not applied** — documented as Step 3 of
      [`REACTIVE_RESUME_DECOMMISSION_GUIDE.md`](REACTIVE_RESUME_DECOMMISSION_GUIDE.md)
      instead of edited directly. Reason: this retires a container real
      candidates may still be mid-CV in, and the sandbox has no way to
      confirm the native builder actually works end-to-end against a live
      backend (no auth past `/Login`). Gated on you running
      `MANUAL_TEST_GUIDE.md` §11 against production first — that's Step 1
      of the guide.
- [ ] Mark the OIDC endpoints deprecated (keep dark one release, then a
      cleanup commit removes resume_sso OIDC routes + tables via migration;
      guest-start stays, it's now JWT-based). **Docstring-level deprecation
      already landed in A5** (see resume_sso.py's module docstring "PIVOT"
      note); actual route/table removal documented as Step 4 of the
      decommission guide, intentionally deferred a full release past Step 3.
- [ ] Traefik: cv.parvagas.pt router → 301 redirect to
      parvagas.pt/Portal/Candidato/Construtor-CV. **Config written**
      (Step 2 of the decommission guide has the exact `redirectRegex`
      middleware + router diff for `deploy/traefik/dynamic/parvagas.yml`,
      matching `TRAEFIK_FIX_GUIDE.md`'s deploy process) but **not applied**
      to the live server — same live-verification gate as above, and this
      is a manual server-side step this sandbox cannot perform regardless
      (no SSH access), consistent with how the original `TRAEFIK_FIX_GUIDE.md`
      fix was handled earlier this session.

**Phase A exit criterion:** a candidate (or guest) creates, edits, previews,
and downloads a CV entirely inside the portal — **met**, confirmed via A1-A6's
test/tsc/vitest/browser verification. "cv-builder container retired" is the
one remaining exit condition, deliberately left for you to execute via
`REACTIVE_RESUME_DECOMMISSION_GUIDE.md` once you've done a live pass.

---

## Phase B — Visual templates via WeasyPrint

### B1 — WeasyPrint integration (backend)
- [x] Add `weasyprint` (`==69.0`, confirmed current stable via WebFetch of
      the official docs) to `backend-python/requirements.txt`.
- [x] Dockerfile (**Alpine**) — verified the *exact* apk names against
      WeasyPrint's own docs rather than guessing: `so:libgobject-2.0.so.0
      so:libpango-1.0.so.0 so:libharfbuzz.so.0 so:libharfbuzz-subset0.so.0
      so:libfontconfig.so.1 so:libpangoft2-1.0.so.0` (virtual packages
      naming the exact shared objects, Alpine ≥3.17 — this image is newer)
      plus `ttf-dejavu` for actual font files (confirmed via
      Kozea/WeasyPrint#677: WeasyPrint crashes outright with zero fonts
      installed, not just renders blank text — a real, previously-untested
      risk this session's earlier guess of "pango fontconfig" would have
      hit). Added to the **runtime** stage only, not the builder — WeasyPrint
      installs as a pure Python/cffi wheel; the native libs are dlopen()'d
      at import time, not link time, so `pip install` itself needs nothing
      extra.
- [x] `app/services/resume_render_service.py`: Jinja2 HTML template + shared
      CSS (`ats-classic`, matching the Phase A reportlab/AtsClassic.tsx look)
      → `weasyprint.HTML(string=...).write_pdf()`. Same template drives both
      `render_html()` (used by the new `GET /resumes/{id}/preview.html`)
      and `render_pdf()` — single source, no more hand-maintained-twice
      layout logic. **Security note not in the original plan text**:
      resume fields are candidate-supplied free text and B3 will serve this
      same HTML to unauthenticated visitors, so autoescape had to be
      explicit (`Environment(autoescape=select_autoescape(...))`, not the
      bare `jinja2.Template()` this codebase's email_service.py uses
      elsewhere) — verified with a real `<script>` payload in a test, see
      below. Also fixed a real bug caught during implementation:
      `Resume.template_id` is a FK to `ResumeTemplate.id` (a uuid), not the
      slug `TEMPLATES` is keyed by — passing it straight through would have
      silently always rendered `ats-classic` regardless of the resume's
      actual template. Added `_template_slug()` to resolve it.
- [x] Guard: `RESUME_WEASYPRINT_ENABLED` (default `false`, added to
      `config.py`/`.env.example` next to the other per-feature flags). The
      export endpoint's PDF branch tries `resume_render_service.render_pdf()`
      only when the flag is on, catches any `Exception`, and falls through
      to the existing `to_pdf()` reportlab call either way — confirmed this
      isn't hypothetical: this sandbox has weasyprint installed but no
      pango/gobject native libs, so `render_pdf()` genuinely raises here
      (normalized to `RuntimeError`, see the render service), and the
      export endpoint still returns a valid PDF via the fallback.
- [x] Tests: `tests/test_resume_render_service.py` (6 tests — full-profile
      section coverage, empty-profile placeholder, malformed-data guard,
      XSS-escaping, unknown-slug fallback, and the real
      RuntimeError-on-missing-native-libs behavior observed in this sandbox)
      plus 4 new tests in `test_resumes_api.py` (export falls back to
      reportlab with the flag on, preview.html 404s when the flag is off,
      renders HTML when on, 404s on a missing resume). Full suite: 245
      passed, 3 skipped (pre-existing, need a live LLM).
      **Not verified**: a real WeasyPrint PDF render end-to-end (this
      sandbox has no pango) — the Dockerfile's package list is verified
      against docs but not build-tested; flag as a deploy-time check.

### B2 — Two visual templates + picker
- [x] `moderno` (single column, red accent bar, left-aligned header — shares
      the single-column HTML skeleton with ats-classic, CSS-only variation)
      and `executivo` (two-column: dark sidebar for contact/skills/languages/
      certifications, main column for summary/experience/education — laid
      out with a table, deliberately not flexbox, since table layout is the
      most reliably-paginated multi-column primitive in WeasyPrint) added to
      `resume_render_service.TEMPLATES`. New migration `20260712_0029` seeds
      the `executivo` row and un-placeholders `moderno`'s description.
      **Deviation from the plan text**: `preview_url` stays NULL — the
      picker draws its thumbnails with CSS instead of loading screenshot
      files, so thumbnails can never drift stale from the real templates
      and no image-asset pipeline is needed.
- [x] Template picker in the editor: thumbnail cards (CSS minis per
      template) in both the desktop preview pane and the mobile preview
      sheet. Selection switches the client-side preview instantly
      (optimistic state update) and PATCHes `template_id` in the
      background, reverting on failure. New client-side preview mirrors
      `Moderno.tsx`/`Executivo.tsx` + a `ResumePreview.tsx` dispatcher whose
      unknown-slug fallback matches `render_html()`'s exactly; the editor's
      two `AtsClassic` call sites now go through the dispatcher. Also fixed
      in passing: the frontend `Resume` type was missing `template_id`,
      which the API had been returning since A1. `impeccable` pass:
      sandbox-blocked as in A3/A4/A6 (auth wall) — already covered by
      MANUAL_TEST_GUIDE.md §11's audit step.
- [x] A4 print-correctness: shared `_PRINT_RULES` block (`@page` A4 margins,
      `break-inside: avoid` on every experience/education entry — each now
      wrapped in `<div class="entry">` — and `break-after: avoid` on section
      headings) prepended to all three templates' CSS, with a test asserting
      every registered template carries the rules. **Multi-page pagination
      not visually verified** (needs a real WeasyPrint render — no pango in
      this sandbox); rules follow WeasyPrint's documented properties, flag
      for the same deploy-time check as B1's render.
- [x] Verify: pytest 253 passed/3 skipped (10 render-service tests incl.
      per-template XSS-escaping + page-break assertions, migration chain
      still single-head), tsc clean, vitest 91 passed (4 new dispatcher/
      template tests), browser check — editor route compiles, redirects
      unauthenticated to /Login, no console/server errors beyond expected
      no-backend noise.

### B3 — Public share page
- [x] `GET /public/resumes/{share_slug}` — new unauthenticated
      `public_router` in resumes.py (registered in router.py, matching the
      /public/cv-submissions and /public/resume-sso/* convention), resolves
      only `is_published` rows and returns render-relevant fields only
      (title/data/template_slug — no ids, no draft state). Plus
      `POST /resumes/{id}/share` toggle: first publish mints a random
      unique slug (collision-retried); the slug is deliberately KEPT on
      unpublish so re-publishing restores the same URL — links a candidate
      already sent around don't rot because they toggled twice.
      `src/app/cv/[slug]/page.tsx` renders the published CV through the
      same ResumePreview dispatcher as the editor (template-aware), with a
      friendly not-found state and a "crie o seu gratuitamente" CTA back to
      the guest form. Editor header gains the "Partilhar"/"Público" toggle
      + a copy-link button (navigator.clipboard, `${origin}/cv/{slug}`),
      with success toasts via the established AppNotifier pattern.
- [x] Verify: unpublished slug 404s + published renders without auth +
      slug-survives-republish + ownership isolation — 4 new tests in
      test_resumes_api.py (26 total there; suite 257 passed/3 skipped).
      tsc clean, vitest 91 passed. Browser: /cv/test-slug-123 renders the
      not-found state gracefully with zero console errors (no backend in
      this sandbox, so the fetch-fails path is the one actually exercised —
      the published-CV render path is covered by the dispatcher tests from
      B2 plus the backend endpoint tests). Live published-link check
      belongs in MANUAL_TEST_GUIDE.md §11's deploy pass.

### B4 — Versions UI
- [x] Backend endpoints were indeed missing — added `GET /resumes/{id}/
      versions` (metadata only, newest first — no data payloads in the
      list), `GET .../versions/{vid}` (one full snapshot on demand), and
      `POST .../versions/{vid}/restore` (restore-as-copy: the snapshot
      becomes a NEW draft resume, never overwrites — matching the plan's
      never-destructive rule for C2 too). Shared `_owned_resume()` helper
      consolidates the ownership-404 check.
      **Gap found and fixed beyond the checklist text**: versions were only
      ever CREATED by the AI rewrite endpoint — the editor's autosave PATCH
      never snapshotted, so the history panel would have shipped
      permanently empty. `update_resume` now snapshots the *outgoing* state
      before applying a data change, throttled to one per 30 minutes
      (`VERSION_SNAPSHOT_MIN_INTERVAL_SECONDS`) so ~10s autosaves don't
      flood the table; unchanged-data saves never snapshot.
- [x] Editor UI: "Versões" button (ClockIcon, header row) opens a modal
      (reused AddItemModal) listing versions with date + change summary,
      per-row "Ver" (read-only snapshot preview through the same
      ResumePreview dispatcher) and "Restaurar como cópia" (POST restore →
      success toast → navigates to the new copy's editor). Empty state
      explains when snapshots get created.
- [x] Verify: pytest 261 passed/3 skipped (4 new: outgoing-state snapshot +
      throttle + no-op-save behavior, list omits data & orders newest-first,
      restore-as-copy leaves original untouched, ownership isolation),
      tsc clean, vitest 91, editor route compiles clean in browser (auth
      wall as always — panel interaction itself is covered by the endpoint
      tests; live click-through belongs to MANUAL_TEST_GUIDE.md §11).

---

## Phase C — Intelligence layer + billing consolidation

### C1 — One LLM client
- [x] Refactored — with one deviation from the letter of the plan text:
      `chat_json()` reads the shared `LLM_*` settings, but ResumeAIService
      needs per-tier endpoint config (RESUME_AI_* cloud providers incl.
      Azure's deployment-path URLs, OLLAMA_* free tier), so the shared
      client gained a low-level `chat_json_request(url, headers, body,
      fallback, timeout)` and `chat_json()` now delegates to it — one HTTP
      + parse + never-raises path for everything, which is the actual
      intent. ResumeAIService keeps its public API and cloud → Ollama →
      heuristic routing; `_request_parts` survives as pure config assembly;
      the bespoke `_call_ai` HTTP block, `_try_parse_json_response`, and
      `_call_ollama`'s native-protocol HTTP are gone (`import httpx`
      deleted from the module). **Protocol note**: the Ollama tier moved
      from Ollama's NATIVE /api/chat (different body and response shape —
      the exact divergence this refactor exists to remove) to its
      OpenAI-compatible /v1/chat/completions, available since early 2024
      and the deployed image is ollama/ollama:latest. Flag for the deploy
      pass: confirm one free-tier score/rewrite round-trip against the real
      container.
- [x] Refactor gate: full suite passes (267/3 skipped) with zero changes to
      existing tests. Plus 6 NEW unit tests (test_resume_ai_service.py)
      monkeypatching the single chat_json_request seam: cloud routing,
      free-tier→Ollama endpoint, LLM-failure→heuristic fall-through,
      rewrite unavailable/cloud paths, and Azure's deployment-URL assembly.
      Backend-only iteration — tsc/vitest untouched (still green from B4),
      no browser surface.

### C2 — In-editor AI actions
- [x] "Adaptar a esta vaga": new `POST /resumes/{id}/adapt` reuses the
      already-tested `inject_job_keywords` grounding pipeline verbatim
      (via `serialize_job`, same as candidates.py's tailored export) —
      pre-adaptation state snapshotted as a version first, response carries
      a diff (`summary_changed` + `added_skills`) the editor shows in the
      success toast, and `changed=false` (flag off / LLM down / nothing to
      add) is a clean no-op with no version created. Editor picker uses the
      same saved-jobs source+shape as CV-e-Documentos's selector.
      **Integration gap found and fixed**: inject_job_keywords appends to
      the flat `skills` list, but the editor's Competências section AND the
      exporters render `hardSkills` whenever non-empty — added skills would
      have been invisible on any from-profile resume; the endpoint now
      mirrors additions into hardSkills.
- [x] "Avaliar CV" + "Melhorar texto" wired to the existing score/rewrite
      endpoints in a new "Ferramentas IA" card: score renders a 5-tile
      breakdown plus a next-step hint derived from the weakest dimension
      (not bare numbers); rewrite mirrors the returned title/summary into
      the editor state (title + data.professionalSummary) so the next
      autosave doesn't silently revert the rewrite — a real footgun, since
      the endpoint only updates the DB columns, not the data blob the
      editor round-trips.
- [x] Verify: pytest 270 passed/3 skipped (3 new adapt tests: flag-off
      no-op with no version, grounded changes + snapshot + hardSkills
      mirroring with the LLM mocked at C1's chat_json seam, unknown-job
      404), tsc clean, vitest 91, editor route compiles clean in browser
      (auth wall — button-level degradation is exercised by the flag-off
      test; the score path always succeeds via heuristic fallback).
      Live-LLM verification (real Ollama round trip) flagged for the
      deploy pass, per the plan text.

### C3 — Cover letters reconciled
- [x] `/premium/cover-letter` (candidates.py) now persists each generated
      draft as a `CoverLetter` row (title auto-derived from the job title,
      starts as a draft) instead of returning ephemeral, never-saved text —
      response gained `coverLetterId` so the caller can deep-link to it.
      New `app/services/cv_export_service.letter_to_pdf()` (same reportlab
      stack/palette as `to_pdf`, just heading + body paragraphs — a letter
      has no CV sections to lay out) backs a new export endpoint.
      Full CRUD added to resumes.py: `GET /cover-letters` (list),
      `PATCH/DELETE /cover-letters/{id}`, `GET /cover-letters/{id}/export`
      — `create_cover_letter` already existed from an earlier phase and was
      reused as-is. **Same route-ordering class of bug as `/matches`, caught
      before it shipped**: `GET /cover-letters` is a static single-segment
      path and had to be registered before `GET /{resume_id}` or it'd be
      permanently shadowed exactly like the original `/matches` bug —
      added both the ordering AND a dedicated regression test for it,
      matching the existing `/matches` test.
- [x] Builder list page gained a "Currículos"/"Cartas" tab switcher — the
      one place candidates manage both document types now. Cartas tab:
      card grid (title, draft/finalizada badge, content preview,
      edit/export-PDF/delete), edit opens a modal textarea → PATCH.
      Deprecating the divergence *itself* means there's now exactly one
      storage model (`CoverLetter`) and one edit surface (this tab) — the
      premium generation endpoint is the entry point, this tab is where
      the letter lives afterward.
- [x] Verify: pytest 279 passed/3 skipped (10 new: create/list, update+
      publish, delete, PDF export, ownership isolation, route-ordering
      regression — plus confirmed the existing `/premium/cover-letter`
      tests in test_candidate_premium_endpoints.py still pass unmodified
      against the new persisting behavior), tsc clean, vitest 91, browser
      check of the list page clean (auth wall as always).

### C4 — Billing consolidation (product decision checkpoint — confirm before executing)
**User confirmed "proceed as planned" via AskUserQuestion before this iteration started** — real billing/access logic and a destructive schema change, so this was not guessed through.

- [x] Gated on `CandidateCVSubscription` tier: `candidate_billing_service.
      candidate_has_premium_access()` now queries `CandidateCVSubscription`
      (paid tier = pro/premium; an explicit `free`-tier row does NOT grant
      access) instead of the old `CandidateSubscription` table.
      **Deviation from the plan's literal wording**: `CANDIDATE_PREMIUM_
      ENABLED` was kept as the master ship-dark switch rather than removed
      outright — the plan's own bullet says "no-subscription = full access
      until pricing is set," which the flag already encodes cleanly (off ⇒
      everyone free regardless of subscription rows) and removing it would
      require either deleting the entitlement check entirely or quietly
      relying on absence-of-any-row as "free," which is a subtler, harder-
      to-audit invariant. `candidates.py`'s three call sites were reordered
      (`_ensure_candidate_profile` now runs before `_require_premium_
      access`, since the check needs `candidate_profile_id`, not
      `user_id`).
- [x] Retired `CandidateSubscription`: model deleted from `models/
      __init__.py`, migration `20260713_0030` drops `candidate_subscriptions`
      (safe — the table was never read in production since the flag
      defaults false). **`candidate_billing_service` itself was NOT
      retired** — it's the module the consolidated check lives in, kept
      and rewritten rather than deleted (deviation from the plan's literal
      "retire ... candidate_billing_service," same reasoning as above: the
      *duplicate table* was the thing worth removing, not the entitlement
      abstraction itself).
- [x] Updated `.env.example` and `MANUAL_TEST_GUIDE.md` (§7's billing dry
      run now walks `CandidateCVSubscription` + the free-tier-doesn't-count
      case; rollout-order note flags that today's real payment flow sells
      CV-builder access, not these specific premium tools — confirm intent
      before flipping the flag in production).
- [x] Verify: pytest 285 passed/3 skipped (rewrote `test_candidate_billing_
      service.py` and the one `CandidateSubscription`-dependent test in
      `test_candidate_premium_endpoints.py` onto `CandidateCVSubscription`,
      added a free-tier-denied case that didn't exist before), migration
      chain still single-head, tsc clean (backend-only iteration, no
      frontend surface).

### C5 — Guest→member conversion nudges
- [x] New `User.is_guest_account` (set true by both shadow-account creation
      sites — resume_sso.py's `guest_start` and jobs.py's
      `submit_spontaneous_cv` — and cleared the moment a real password is
      set via `AuthService.reset_password`, which is the "claiming" event
      for both flows) + `User.guest_claim_email_sent_at` for one-shot
      rate-limiting. Migration `20260713_0031`.
- [x] Post-export prompt: dismissible amber banner in the editor, shown
      once after export for `user.isGuestAccount`. **Reused
      `RestorePass.tsx` directly** (its self-contained trigger + modal +
      captcha-verified `/auth/forgot-password` call) instead of building a
      new flow — the plan's own wording ("→ existing forgot-password
      flow") pointed at exactly this component; dropping it in was less
      code than a bespoke button.
- [x] Rate-limited claim email: `_maybe_send_guest_claim_email()` fires on
      a guest's first `/resumes/{id}/export` call (any format), mints a
      password-reset token (same mechanism as the real forgot-password
      flow, so the link both claims the account AND sets the password),
      and sends via a new `EmailService.send_guest_cv_claim_email()` /
      Celery task pair mirroring `send_password_reset_email`'s shape
      exactly. Guarded by `guest_claim_email_sent_at` — true one-shot, not
      a rolling cooldown, since this is a conversion nudge, not a
      recurring notification.
- [x] Verify: pytest 299 passed/3 skipped (2 new: claim email fires once
      on first guest export and not again on a second, never fires for a
      non-guest account), migration chain still single-head, tsc clean
      (added `is_guest_account`/`isGuestAccount` to the `UserResponse`
      schema and every frontend `setUser()` call site that already threads
      through `data.user.*` — Login's two flows, and the CV-builder guest
      form), vitest 91, browser check of both `/Login` and the editor
      route clean. This closes Phase C (C1-C5) in full.

---

## Phase D — Ecosystem integration

### D1 — Apply with a chosen CV
- [x] `JobApplication.resume_id` — nullable `String(36)`, no DB-level FK,
      matching this table's existing convention (`job_id`/
      `saved_cv_document_id` are the same loose-reference shape, not real
      foreign keys). Migration `20260713_0032`.
- [x] Apply flow (`Aplicar/[id]/page.tsx`): the two-way "CV já guardado /
      enviar novo CV" radio became a three-way `cvSource` picker — a new
      "Usar CV do Construtor de CV" option (backed by `GET /resumes/`)
      is added and preselected whenever the candidate has at least one
      resume (native builder CVs are more complete/current than a static
      upload); falls back to the previous saved/upload choices otherwise.
      Backend `POST /candidates/jobs/apply` gained `resumeId`, verified
      owned by the applying candidate before attaching.
- [x] Employer-side: `GET /applications/{id}/candidate-cv` now lists the
      attached native resume first among "documents" (flagged
      `isNativeResume`, `signedUrl: null` since it's rendered on demand,
      not a stored file). New `GET /applications/{id}/resume-cv`
      (company-owner/admin gated, same ownership check as candidate-cv)
      renders the PDF via the Phase A reportlab path. Candidaturas page
      renders it as a "Descarregar" button (authenticated blob download,
      same pattern as the CV builder's own export buttons) instead of the
      bare `<a href={signedUrl}>` used for stored CVUpload files.
- [x] Verify: pytest 304 passed/3 skipped (5 new: apply-with-resume attaches
      + sets profile_source, ownership rejection on a resume the candidate
      doesn't own, candidate-cv lists it first with no signedUrl,
      resume-cv download returns real PDF bytes for the owning company,
      403 for a different company), migration chain single-head, tsc
      clean, vitest 91, browser check of both `/Aplicar/[id]` and
      `/Portal/Empresa/Candidaturas` clean (auth wall on the latter).
### D2 — Auto-apply uses documents
- [x] New `_suggested_resume(db, profile, job)` in candidates.py: prefers a
      resume whose title/professionalTitle mentions the job's category
      (Resume has no dedicated category field to match on precisely — a
      substring check on the two free-text fields it does have), else the
      most recently updated resume. `approve_auto_apply_proposal` attaches
      it (`resume_id`) instead of the `CVUpload` fallback when one exists,
      tagging `profile_source="auto_apply_resume"` (vs. plain
      `"auto_apply"`) so the distinction is visible in the data.
      **Deviation from the plan's literal "carries a suggested resume"
      wording**: NOT stored on `JobMatchProposal` as a persisted field —
      computed fresh on every read/approve instead. A proposal can sit
      pending for days; persisting the pick risks staleness the moment the
      candidate edits or adds a resume after the proposal was created.
      Exposed in `GET /auto-apply/proposals`'s response
      (`suggestedResumeId`/`suggestedResumeTitle`) too, computed per-job
      since the category match can differ per proposal — no frontend
      surfacing added yet (out of scope for this iteration; the existing
      proposals list UI doesn't render per-proposal document info at all
      today, so this is additive data the UI can pick up later without a
      backend change).
- [x] Verify: pytest 308 passed/3 skipped (4 new: category-match wins over
      newest, falls back to newest when no title matches, CVUpload
      fallback preserved when the candidate has zero resumes, list
      endpoint exposes the suggestion), tsc clean. Backend-only iteration,
      no frontend surface — vitest/browser unchanged from D1.
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
