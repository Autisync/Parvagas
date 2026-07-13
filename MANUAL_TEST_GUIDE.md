# Manual Test Guide — Full User Journey + career-ops Integration

Run this against a **real deployed environment** (staging or production),
not this sandbox — the automated test suites already cover unit/integration
logic (`pytest tests/` → 227 tests, `npx vitest run` → 78 tests, both green
as of this writing); this guide is for the things that can only be verified
by clicking through the real app with a real backend, database, and Ollama
instance.

Work through the sections in order — later sections assume earlier ones
passed. Check off each step as you go. If a step fails, stop and report
which step/expected-vs-actual before continuing past it.

---

## 0. Pre-flight (do this once, before anything else)

- [ ] `git pull` on the server / redeploy `backend-python` so the new
      migrations run (`20260706_0022` through `20260708_0025`). Confirm via
      `alembic current` (or check the admin panel loads without DB errors).
- [ ] Confirm `docker exec <ollama-container> ollama list` shows a model —
      if empty, run `docker exec <ollama-container> ollama pull llama3.2:3b`
      (or whatever `LLM_MODEL` is set to). **`OLLAMA_MODELS` in
      docker-compose.yml does NOT auto-pull models** — this step is easy to
      skip and will silently make every Llama feature fall back to its
      non-AI behavior with no visible error.
- [ ] Confirm the new env vars are set (see `backend-python/.env.example`
      for the full list): `LLM_ENABLED`, `LLM_PROVIDER`, `LLM_BASE_URL`,
      `LLM_MODEL`. Leave `AUTO_APPLY_LLM_SCORING_ENABLED`,
      `CV_EXPORT_LLM_INJECTION_ENABLED`, `CANDIDATE_PREMIUM_ENABLED` at
      their default `false` for now — Section 8 walks through turning each
      on individually.
- [ ] Restart `backend-python` + `celery-worker` + `celery-beat` so the new
      env vars and code are picked up.

---

## 1. Regression check — things fixed earlier this session

These aren't new features, but confirm the fixes actually landed in prod.

- [ ] Log in as a candidate whose profile is **already complete**
      (`hasCompletedOnboarding=true`). Confirm you are **not** redirected to
      the onboarding wizard or shown the tutorial modal again. Repeat login
      2-3 times in a row — this was the exact bug (forced onboarding on
      every login).
- [ ] Visit `/Portal/Candidato/Onboarding` directly a few times in a row
      (refresh repeatedly). No `insertBefore` crash, no blank white screen.
- [ ] Visit `/Vagas-Disponiveis`, open browser DevTools → Network tab,
      submit a keyword search. Confirm the `/jobs?...` request fires
      **exactly once** (previously fired twice per search/page-click).
- [ ] In the candidate portal (`/Portal/Candidato/Vagas-Disponiveis`), click
      the "Remoto/Híbrido" or "Com salário" filter chip. Page through
      results — confirm you never land on an empty page while the pager
      still shows more pages available.
- [ ] Visit the homepage — confirm the carousel shows real photos (not
      colored icon shapes) and auto-advances every ~6s.

---

## 2. Guest (no-account) applicant journey

- [ ] Browse `/Vagas-Disponiveis` **while logged out**, open any job.
- [ ] Click "Candidatar" → fill the guest quick-apply form (name, email,
      phone, location, CV upload) → submit.
- [ ] Confirm the success screen shows an amber "Sem conta? Guarde este
      link." box with a working tracking link, **and** a red "Acompanhar
      candidatura" button.
- [ ] Click that tracking link (or copy the emailed one) — confirm
      `/Candidaturas/Acompanhar?token=...` loads and shows the application
      status ("Candidatura recebida" or similar), the job title, and the
      company name.
- [ ] Check the email inbox used for the guest application — confirm a
      confirmation email arrived with the same tracking link.
- [ ] **If the job you applied to is an aggregated/scraped listing with an
      admin-set contact email** (see Section 6): confirm that email address
      also received a "Nova candidatura" notification with a "Ver
      candidaturas desta vaga" link, and that link
      (`/Empresa/Candidaturas-Externas/{jobId}?token=...`) shows the
      application you just submitted, with a working CV download link.

---

## 3. Candidate account journey

- [ ] Sign up as a new candidate (email + password). Confirm the
      verification email arrives; click the link; confirm login works
      afterward.
- [ ] On first login, confirm the tutorial modal appears, then the
      onboarding wizard. Complete it.
- [ ] Log out, log back in — confirm you now go **straight to the
      dashboard**, no tutorial/onboarding replay (this is the Section 1
      regression check, but worth re-confirming with a genuinely fresh
      account).
- [ ] Go to `/Submission` (homepage "Criar Perfil por CV" CTA) — submit a
      CV as a guest. Confirm no error, and that a confirmation email
      arrives.
- [ ] In `/Portal/Candidato/CV-e-Documentos`, upload a CV via the "Carregar
      CV" dropzone. Confirm parsing completes and the extracted-data review
      form appears with your real name/skills/experience prefilled.
      Confirm/save it.

---

## 4. Apply flow (authenticated)

- [ ] As a logged-in candidate, open a job and click "Candidatar" — confirm
      the authenticated apply form (not the guest form) appears, prefilled
      with your saved profile.
- [ ] Submit. Confirm success screen + "Ver as minhas candidaturas" button
      works and shows the new application in `/Portal/Candidato/Candidaturas`.
- [ ] Save a job (heart/bookmark icon) — confirm it appears in
      `/Portal/Candidato/Vagas-Guardadas` and can be unsaved.

---

## 5. Auto-apply preferences + proposals (Phase 1)

- [ ] In `/Portal/Candidato/CV-e-Documentos`, find the "Candidatura
      automática por área" card. Select 1-2 categories, toggle it on, save.
- [ ] Confirm the copy still says **"Nenhuma candidatura é submetida sem a
      sua aprovação"** — this must never change to imply silent
      auto-submission.
- [ ] Trigger a proposal-generation run manually (ask an engineer to run
      the Celery task `generate_auto_apply_proposals` once, or wait for its
      6-hour Beat schedule) against a candidate profile + CV that matches
      at least one live job in the selected category.
- [ ] Refresh CV-e-Documentos — confirm a "Sugestões de candidatura para
      rever" card appears with a job, a match-%, and reasons.
- [ ] Click "Dispensar" on one — confirm it disappears and **no**
      application was created (check `/Portal/Candidato/Candidaturas`).
- [ ] Click "Aprovar e candidatar" on another — confirm it disappears
      **and** a new application now appears in Candidaturas.

---

## 6. CV export, incl. job-tailored export (Phase 2)

- [ ] In CV-e-Documentos → "Exportar perfil como CV": leave "Vaga alvo" as
      "CV genérico" and download PDF/DOCX/JSON. Confirm all three open
      correctly and match your saved profile.
- [ ] Save a job first (Section 4), then return to the export section —
      confirm it now appears in the "Vaga alvo" dropdown. Select it,
      export PDF. Open the file — with `CV_EXPORT_LLM_INJECTION_ENABLED`
      still `false` at this point, it should be **identical** to the
      generic export (this confirms the flag-off path is truly a no-op).
- [ ] On that job's detail page, find the new "Preparar candidatura" card
      → "CV adaptado" → download PDF. Confirm it downloads (same
      flag-off/no-op content as above for now).
- [ ] **Flip `CV_EXPORT_LLM_INJECTION_ENABLED=true`, restart backend.**
      Repeat the tailored export from either location. Confirm:
  - The summary text changed to reference the job.
  - Your original skills are **all still present**.
  - Any newly-added skills are ones that were actually listed as required
    on that specific job (open the job posting and check) — not fabricated.
  - No employer names, dates, or degrees appear that you didn't actually
    enter in your profile.
- [ ] Stop the Ollama container (or block `LLM_BASE_URL`), repeat the
      tailored export once more. Confirm it still succeeds — falling back
      to the plain (untailored) CV instead of erroring or hanging. Restart
      Ollama afterward.

---

## 7. Premium AI tools (Phase 4) — ships free today

- [ ] Confirm `CANDIDATE_PREMIUM_ENABLED` is still `false`. As a logged-in
      candidate on any job detail page, open "Preparação da candidatura" →
      click all three: "Preparar entrevista", "Carta de apresentação",
      "Sobre a empresa". Confirm each returns content (or a clear
      "indisponível" message if your profile has no work experience yet —
      try again after adding some) with **no payment prompt at all**, since
      the flag is off.
- [ ] "Preparar entrevista": confirm the STAR stories reference real
      entries from your own work experience — not employers/roles you
      never entered. If your profile has zero work experience, confirm it
      returns "Sem experiência profissional registada" instead of
      inventing a story.
- [ ] "Carta de apresentação": confirm it names the real job title and
      doesn't contain placeholder text like `[Company Name]` or `[Your
      Name]`.
- [ ] "Sobre a empresa": for a job posted by a real registered company,
      confirm the snapshot only contains true facts (name, website,
      description) you can verify against that company's own profile page
      — not invented history, funding, or size claims. For an
      aggregated/scraped job with no real company account, confirm it
      returns "Sem informação suficiente" rather than fabricating anything.
- [ ] **Billing dry run (optional, do this on staging only):** flip
      `CANDIDATE_PREMIUM_ENABLED=true`, restart backend. Confirm the same
      candidate (no `CandidateCVSubscription` row, or only a `free`-tier
      one) now gets a 402/blocked response from all three tools. Manually
      insert a `CandidateCVSubscription` row for that candidate's
      `CandidateProfile` (`plan_tier='pro'`, `status='active'`), retry —
      confirm access is restored. Also confirm a `plan_tier='free'` row
      does NOT grant access (these premium tools are gated separately from
      the CV builder's own free tier). **Flip the flag back to `false`
      afterward** unless you're intentionally launching billing. (C4,
      EXECUTION_PLAN_NATIVE_CV_BUILDER.md: this used to be a dedicated
      `CandidateSubscription` table with no real payment flow behind it —
      now consolidated onto `CandidateCVSubscription`, the same table
      `payments.py` already backs.)

---

## 8. Scraper — Angola-market adapters (Phase 3)

- [ ] Ask whoever owns `SCRAPER_SOURCES` config: is a Careerjet partner
      account + affiliate ID already set up? **Do not enable the Careerjet
      adapter without first reading its docstring in
      `scraper_service.py` and Careerjet's actual partner terms** — it's a
      live search proxy, not a bulk-export feed, and republishing its
      results onto our own board wasn't confirmed to comply with their
      agreement.
- [ ] If you do have Greenhouse/Lever board tokens for real employers
      hiring in Angola (e.g. an oil & gas major's careers page), add one to
      `SCRAPER_SOURCES` and trigger a scrape run manually. Compare the
      ingested job's fields against that employer's actual live posting —
      confirm title/location/description match (these adapters were built
      from documented API shapes, not a captured live response, so this is
      the first real-world check).
- [ ] Confirm ingested jobs land in the admin scraped-jobs review queue
      with a quality score, and publishing one creates a live `Job` with
      the real company name (not "Parvagas Aggregator").

---

## 9. Admin — contact email + no-account employer flow

- [ ] In the admin scraped-jobs editor, open any pending/approved scraped
      job. Confirm there's now a "Email de contacto da empresa" field.
      Enter a test email you control, save, publish (or it's already
      published — edits sync to the live job).
- [ ] Have a guest (or yourself in an incognito window) apply to that job
      (Section 2). Confirm the contact email you set receives a "Nova
      candidatura" notification, distinct from the internal admin
      notification.

---

## 10. Final regression sweep

- [ ] Run `pytest tests/` and `npx vitest run` one more time on the deployed
      branch/commit to confirm nothing environment-specific broke.
- [ ] Spot-check the employer (company) side is unaffected: log in as a
      company, post a job, view applicants, change an application status —
      confirm the candidate gets the status-change email. None of this
      session's changes touched company-side flows, but it's cheap
      insurance before calling this integration complete.

---

## 11. Construtor de CV nativo

The CV builder was rebuilt natively inside the Parvagas portal (see
`FEASIBILITY_NATIVE_CV_BUILDER.md` and `EXECUTION_PLAN_NATIVE_CV_BUILDER.md`)
— it no longer redirects to the separate `cv.parvagas.pt` Reactive Resume
instance. This section only exercises things the sandbox that built this
feature genuinely could not: a live backend, an authenticated session past
`/Login`, and the `impeccable` visual-polish audit.

- [ ] Logged-in candidate: sidebar → "Construtor de CV" opens
      `/Portal/Candidato/Construtor-CV`. Click "A partir do meu perfil" —
      confirm the new CV is pre-filled from the candidate's existing profile
      data (name, contact info, experience, education if present), not blank.
- [ ] Click "Começar do zero" — confirm a blank CV opens straight in the
      editor (no intermediate "creating…" dead end).
- [ ] In the editor, fill in a few fields across different sections (Dados
      Pessoais, Resumo, Experiência) and stop typing. Confirm the "A
      guardar…" → "Guardado" indicator appears within ~10s (autosave), and
      that typing was never blocked or lagged while it saved.
- [ ] Confirm the desktop live preview (right pane) updates to reflect the
      edits, and the completeness meter/percentage moves as sections fill in.
- [ ] Resize to mobile width (or use a real phone). Confirm the preview is
      NOT squeezed into a tiny side column — a floating "Pré-visualizar"
      button should open it full-screen instead.
- [ ] Add a work experience and an education entry via the "Adicionar"
      modals. Confirm they appear in both the section list and the preview,
      and that reordering (move up/down) works.
- [ ] From both the CV list page and inside the editor, export PDF, DOCX,
      and JSON. Confirm all three downloads succeed and a green success
      toast appears for each. Open the PDF and confirm it's readable and
      not obviously broken (layout, encoding, missing sections).
- [ ] Duplicate a CV from the list page — confirm a copy appears with a
      success toast. Delete a CV — confirm the confirmation dialog appears,
      and after confirming, the card disappears with a success toast.
- [ ] Guest journey: log out (or use an incognito window). From the
      homepage or header, click "Construtor de CV" — confirm it lands on
      `/Submission` scrolled to (or containing) the "Criar CV do Zero" form,
      NOT a dead link. Fill in name + email and submit — confirm you land
      directly in the native editor, already logged in (check the header
      shows the account, not "Entrar"/"Criar conta"). Confirm a
      verification email arrives at that address (this is a real new
      account, same shadow-account pattern as the guest CV-upload flow).
- [ ] Repeat the guest form with the SAME email — confirm it does NOT
      create a second account or send a second verification email, and
      still lands the visitor in the editor (their existing CVs, if any).
- [ ] Run the `impeccable` design/UX audit skill against
      `/Portal/Candidato/Construtor-CV` and its editor route while logged in
      — this needs a real authenticated session, which the sandbox that
      built this feature never had access to. Fix whatever it flags.

---

## Rollout order once everything above passes

1. `AUTO_APPLY_LLM_SCORING_ENABLED=true` — lowest risk, additive score
   refinement only.
2. `CV_EXPORT_LLM_INJECTION_ENABLED=true` — re-run Section 6's tailored-export
   checks in production with real candidates before calling it done.
3. `CANDIDATE_PREMIUM_ENABLED=true` — **only after real pricing exists for
   these specific tools**; flipping it now blocks everyone who isn't on a
   paid `CandidateCVSubscription` tier, and today's real payment flow
   (`payments.py`) sells CV-builder-tier access, not this. Confirm the two
   are meant to be the same purchase before flipping this flag.
4. Careerjet scraper adapter — **only after the partner-terms question in
   Section 8 is resolved**.
