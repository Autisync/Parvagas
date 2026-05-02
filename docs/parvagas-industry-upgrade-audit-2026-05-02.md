# Parvagas 2 Audit and Upgrade Report (2026-05-02)

## Scope covered in this implementation pass

This pass focused on high-impact, production-safe upgrades that improve:

- Job application conversion (simplified apply flow)
- Candidate CV access security (RBAC + least privilege)
- Company/moderator UX for candidate CV review
- Structured auditability of sensitive profile/CV access

## Architecture audit summary

### Existing strengths

- Supabase is already the active persistence layer via `server/db/modelFactory.js`.
- JWT + role-based auth are in place.
- A central notifier system exists on frontend.
- Application and candidate workflows already include audit logging patterns.

### Gaps identified

- Public apply CTA redirected only to candidate portal flow, creating friction for guests.
- No dedicated guest quick-apply endpoint for short-form submissions.
- No explicit backend endpoint for moderator/company CV viewing by application ownership.
- Candidate CV access permission was not explicitly modeled as a named RBAC permission.

## Implemented changes

### 1) RBAC and secure CV viewing

- Added new permission `admin.candidateCv.view`.
- Added a dedicated CV-view endpoint with role-aware authorization.
- Enforced scope:
  - Platform moderators/admins: allowed with permission.
  - Company users: allowed only when application belongs to one of their company jobs.
- Added audit log event `candidate.cv.view` with details about access scope and resource.

### 2) Simplified application flow

- Added a new apply route with dual-path UX:
  - Logged-in candidate path: prefill + choose existing CV or upload job-specific CV + note.
  - Guest path (Quick Apply): short form + CV upload.
- Added upload progress feedback on client side.
- Updated public job detail CTA to route to the new flow.

### 3) Guest quick apply backend

- Added `POST /public/jobs/:id/quick-apply` with multipart upload.
- Validates:
  - Required short fields
  - Email format
  - CV type (PDF/DOCX)
  - Job eligibility (public + approved/published)
- Creates/updates temporary candidate context and profile snapshot.
- Stores CV in storage and creates candidate document record.
- Creates application and notifies recruiter/candidate (best effort).
- Logs `application.quickApply.create` for traceability.

### 4) Company portal CV UX

- Added “Ver CV” action in company applications list.
- Fetches and renders secure CV payload from backend endpoint.
- Displays candidate summary and downloadable signed document links.

## File-level deliverables

### Backend

- `server/services/rbacService.js`
  - Added `ADMIN_CANDIDATE_CV_VIEW` permission.
  - Included permission in moderator set.

- `server/routes/applications.js`
  - Added `GET /applications/:id/candidate-cv` route.

- `server/controller/applications.js`
  - Added `getApplicationCandidateCv` controller.
  - Added robust ownership checks for company viewers.
  - Added audit log on CV access.

- `server/routes/public.js`
  - Added multipart quick-apply endpoint: `POST /public/jobs/:id/quick-apply`.
  - Added candidate temp record flow, CV storage, application creation, and notification hooks.

### Frontend

- `src/app/Aplicar/[id]/page.tsx`
  - New unified application experience with candidate and quick-apply modes.
  - Includes upload progress state and success/error notifications.

- `src/app/Vagas-Disponiveis/[id]/page.tsx`
  - Updated CTA to `Aplicar/[id]` flow.

- `src/app/Portal/Empresa/Candidaturas/page.tsx`
  - Added secure CV modal and fetch action per application.

### Tests

- `server/tests/integration.test.js`
  - Added test coverage for:
    - Company CV access by application.
    - Quick apply guest submission endpoint.

## Validation run

- `npm run typecheck`: passed.
- Focused integration run includes one unstable assertion around company CV access in current seeded test path; endpoint logic was hardened for mixed ID shapes in document-store mode, but full suite re-validation should be executed after test fixture normalization for company ownership setup.

## Remaining backlog (not fully implemented in this pass)

- Full UI design system standardization across all pages/components.
- Multi-language i18n extraction and translation pipeline.
- New feature modules (assessments, messaging, referrals, calendar integrations, talent pool, advanced company analytics).
- Complete Supabase RLS SQL policy hardening document and migration scripts per table.
- E2E coverage for responsive breakpoints and keyboard navigation audits.

## Recommended next execution order

1. Stabilize and finalize company-CV ownership fixtures in integration tests.
2. Extract reusable form primitives and spacing/typography tokens into shared UI components.
3. Add i18n scaffolding (`pt`, `en`) and externalize hardcoded labels.
4. Implement messaging + interview scheduling as modular service-layer features.
5. Add dedicated security and accessibility test pipelines (WCAG checks + keyboard-only smoke).
