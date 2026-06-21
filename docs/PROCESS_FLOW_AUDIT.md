# Parvagas — Process-Flow Audit vs. Industry Standard & Market Need

**Date:** 2026-06-21 · **Scope:** every core function, grounded in the live codebase + API behaviour verified during stress/functional testing.
**Market lens:** Angola/PALOP job market (primary), benchmarked against LinkedIn, Indeed, Glassdoor, and regional boards (Jobartis, emprego.co.ao, Mundoemprego).

Legend: ✅ solid · 🟡 partial/naive · 🔴 missing/stubbed

---

## 1. Candidate journey

| Step | Current flow (code) | Industry standard | Gap & market need |
|---|---|---|---|
| Discover jobs | `GET /jobs` — title `ilike`, + location/category/workMode filters, pagination | Full-text relevance search, faceted filters (salary, seniority, date, contract), typo tolerance, "near me" | 🟡 No full-text/relevance ranking, no salary/date/seniority facets, no geo. MeiliSearch is referenced but **not wired**. Search is the #1 candidate behaviour — biggest ROI. |
| Register / verify | Email+password, email verification, bcrypt, lockout | Social login (Google), phone/OTP (huge in Angola), magic link | 🟡 No social/phone login. **Phone-first onboarding is a market need** (low email penetration, high mobile). |
| Build profile / CV | Profile CRUD + CV upload + parse (optional AI), completion score | Resume parse→autofill, profile strength meter, public profile URL | ✅ Strong. AI parse + completion score is above regional norm. 🟡 No public shareable profile. |
| Recommendations | `GET /candidates/jobs/recommended` — **skill-substring overlap** ranking | Semantic/ML matching, collaborative filtering, "jobs for you" emails | 🟡 Naive heuristic. Acceptable v1; market differentiator would be real matching. |
| Apply | `POST /candidates/jobs/apply` (+ guest quick-apply), milestone UX | 1-click apply, application autofill, status timeline | ✅ Solid, incl. guest quick-apply (good for liquidity). |
| Track applications | `GET /candidates/applications` with status | Status timeline, employer-viewed signal, withdraw | ✅ Present (status maps exist). 🟡 No "viewed by employer" signal. |
| Save jobs | save/saved/unsave endpoints | ✅ standard | ✅ Done. |
| Job alerts | Dashboard calls `/candidates/alerts` — **endpoint does not exist** | Saved-search → scheduled email alerts (table-stakes) | 🔴 **Unimplemented.** Alerts drive retention/return visits — high priority. |

## 2. Employer / company journey

| Step | Current flow | Industry standard | Gap & market need |
|---|---|---|---|
| Register + verify | Company signup, status `pending_verification` → admin verifies | Domain/email verify, self-serve + manual review | ✅ Verification flow is a real trust differentiator for the market. |
| Post a job | `POST /companies/jobs` → `pending_platform_review` → admin approve | Self-serve publish (optionally moderated), drafts, templates, duplicate | ✅ Works. 🟡 Every job needs manual admin approval — won't scale; add auto-approve for verified companies + spot-checks. |
| Manage applicants | `GET /companies/applications`, status PATCH | Kanban pipeline, bulk actions, notes, ratings, interview scheduling | 🟡 Status changes only. No pipeline board, notes, or scheduling — the core ATS value. |
| Team / collaborators | Frontend calls `/companies/team*` — **not in API** | Multi-seat, roles, invites | 🔴 **Team management endpoints missing** (frontend expects them). |
| CV access / contact | `candidate-cv` per application | Search candidate database, contact credits | 🟡 No candidate-search/sourcing product (a major employer revenue stream). |
| Analytics for employer | none | Job views, apply rate, funnel | 🔴 Missing employer-side analytics. |

## 3. Admin / moderation

| Step | Current flow | Industry standard | Gap |
|---|---|---|---|
| Overview + analytics | ✅ now real (totals, distributions, 14-day series, trends) | Cohorts, funnels, retention, exportable | ✅ Solid baseline (implemented this session). 🟡 No cohort/retention. |
| Job moderation | `PATCH /admin/jobs/{id}/moderate` persists | Queue, bulk, reason codes, SLA | ✅ Works. 🟡 No bulk actions / reason taxonomy. |
| Company verification | persists status | ✅ | ✅ |
| Applications queue | `GET /admin/applications` (implemented this session) | ✅ | ✅ |
| Scraped jobs (aggregation) | **No model/feature** — endpoints return `[]` | Aggregating external listings seeds supply/liquidity | 🔴 Major gap. A new board needs supply liquidity day one; scraping/aggregation is how regional boards bootstrap. |
| Audit logs | **in-memory**, reset on restart | Durable, immutable, exportable | 🔴 Not persistent — compliance risk. |
| Ads/campaigns | CRUD + impression/click tracking | Targeting, pacing, billing | 🟡 Tracking only; no billing. |

## 4. Cross-cutting systems

- **Search infra** 🟡 — `ilike` on Postgres. MeiliSearch referenced but not connected. Need real search for scale + relevance.
- **Notifications** 🟡 — in-app notifications + SMTP email + SSE heartbeat. No web push, no SMS/WhatsApp (critical channel in Angola), no digest emails.
- **Monetization** 🔴 — no payments. Market models: employer subscriptions, pay-per-post, featured/urgent listings, CV-database access, sponsored ads (ads exist but unbilled). **No local payment rails** (Multicaixa Express, Unitel Money, bank reference) — essential for the market.
- **Matching/AI** 🟡 — CV parse (good), recommendations naive. Opportunity: semantic matching as differentiator.
- **Trust & safety** 🟡 — company verification ✅; no candidate identity verification, no fraud/scam-job detection (a real problem regional boards face).
- **Mobile** 🟡 — responsive web (improved this session). No native/PWA; offline + low-bandwidth matter in-market.
- **i18n** ✅ — pt-PT throughout; consider local languages later.
- **SEO** ✅ — SSR job detail pages with metadata (good for organic discovery, a top acquisition channel).
- **Reliability** ✅ — verified 0 server errors under load; N+1 fixed (427 req/s on `/jobs`); rate limiting on auth (⚠️ verify proxy-IP keying before prod).

---

## Prioritized roadmap (impact × market need)

**P0 — liquidity & retention (the two-sided cold-start problem)**
1. **Job alerts** (saved search → email/SMS) — table-stakes retention; endpoint missing.
2. **Supply liquidity**: implement scraped-jobs aggregation OR an aggressive employer free-post push. A board with few jobs loses candidates immediately.
3. **Real search** (wire MeiliSearch): relevance + salary/date/seniority facets + geo.

**P1 — employer value & revenue**
4. **Applicant pipeline (mini-ATS)**: kanban, notes, ratings — the core employer retention loop.
5. **Team management** endpoints (frontend already expects them).
6. **Monetization + local payments**: featured listings & employer plans via Multicaixa Express / Unitel Money / bank reference.

**P2 — trust, scale, growth**
7. **Phone/OTP + Google login** (mobile-first market).
8. **Durable audit logs** + moderation reason taxonomy + auto-approve for verified companies.
9. **WhatsApp/SMS notifications** (dominant channel locally).
10. **Scam-job detection** + candidate identity signals.

**P3 — differentiation**
11. Semantic matching, employer-side analytics, public candidate profiles, PWA/offline.

---

## What's genuinely ahead of regional norm (keep/lean in)
- Company verification trust layer, AI CV parsing + completion scoring, guest quick-apply, SSR/SEO job pages, a real admin analytics console, premium responsive UI, and a hardened backend (migrations, rate limiting, health/readiness). These are credible differentiators to market against incumbents.
