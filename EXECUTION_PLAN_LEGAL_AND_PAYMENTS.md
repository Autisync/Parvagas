# Execution Plan — Legal Documentation System + Payment/Dispute Hardening

**Status:** proposed (awaiting go-ahead + one required input)
**Decisions locked (2026-07-20):**
- **Jurisdiction:** Angola (Lei 22/11) **+ Portugal/EU (GDPR)** — dual regime, GDPR is the stricter floor.
- **Canonical domain:** `parvagas.pt` — all docs, emails (`privacidade@parvagas.pt`), and metadata standardize on `.pt`.
- **Payments:** local rails only (Multicaixa Express, Unitel Money, bank transfer, manual), AOA, no card network. "Chargeback" = **local payment dispute / reversal**, not a card chargeback.
- **Refund posture:** **hybrid** — employer (B2B) plans non-refundable once activated; candidate CV Builder (B2C) gets the EU **14-day cooling-off** right, waivable only after paid AI features are first used.

> ### ⚠️ Required input before drafting finalises (ONE fill-once block)
> Every contract-grade doc (ToS, Employer Terms, MSA, DPA, Refund Policy) needs the **registered contracting entity**. Supply once and it threads everywhere via a single token `[[ENTITY_BLOCK]]`:
> - Registered legal name (e.g. "Parvagas, Lda." / "Parvagas Unipessoal Lda.")
> - NIF / registration number + country of registration
> - Registered address
> - Support + legal/DPO contact emails (default `privacidade@parvagas.pt`, `suporte@parvagas.pt`)
>
> Until supplied, docs render with the placeholder and a visible "PENDING ENTITY DETAILS" banner in admin so nothing ships half-identified.

> ### Assumption to confirm: "Cyber Liability"
> Interpreted as an **Information Security & Breach-Notification Policy** (public trust statement + internal 72h GDPR breach runbook + liability-limitation clauses in ToS/MSA) — **not** a cyber-insurance certificate (that requires a real insurer; I can't fabricate coverage). If you actually hold/plan a cyber-insurance policy, tell me and I'll add a coverage-disclosure section instead of drafting the security policy from scratch.

---

## Part A — The document set (what gets written)

Existing 7 `.docx` are revised, not discarded. Factual corrections needed across all of them: `parvagas.ao` → `parvagas.pt`; Angola-only → Angola+GDPR dual; **remove the stale Skima/ApyHub CV-parser reference** (current stack is a self-hosted Ollama tier + an OpenAI-compatible cloud API); align retention numbers with what the code actually enforces.

### Public-facing (visitor / candidate / employer)
| # | Document | Status | Route |
|---|----------|--------|-------|
| 1 | Privacy Policy | revise (GDPR+Angola, subprocessors, DPO, transfers) | `/privacidade` (exists) |
| 2 | Terms of Service (general) | revise | `/termos` (exists) |
| 3 | Employer Terms | revise | `/termos-empregador` (exists) |
| 4 | Cookie Policy | revise | `/cookies` (**new route** — currently only a banner) |
| 5 | Data Retention Policy | revise | `/politica-retencao` (exists) |
| 6 | Candidate CV & AI Consent | revise (fix subprocessors) | `/consentimento-cv-ia` (**new public route**; today it's only an inline signup checkbox) |
| 7 | **Refund & Cancellation Policy** | **NEW** | `/reembolsos` — **must render at checkout before payment** |
| 8 | Acceptable Use Policy | **NEW** (recommended) | `/utilizacao-aceitavel` |

### B2B / contractual
| # | Document | Status | Placement |
|---|----------|--------|-----------|
| 9 | **Master Service Agreement (MSA)** | **NEW** | `/legal/msa` (public reference) + downloadable PDF attached to employer onboarding |
| 10 | **Data Processing Agreement (DPA)** | **NEW** (GDPR Art. 28 + subprocessor annex + international-transfer safeguards) | `/legal/dpa` + admin-generated signed PDF per employer |

### Internal / operational (admin-only, `audience=internal`)
| # | Document | Status |
|---|----------|--------|
| 11 | **Information Security & Breach-Notification Policy** ("Cyber Liability") | **NEW** |
| 12 | Admin Access & Operations Policy | revise (existing #07) |
| 13 | **Dispute Response Template** (canned structured reply) | **NEW** |
| 14 | **Dispute Response Workflow / SOP** (runbook) | **NEW** |

---

## Part B — Where documents live (central hub + admin management)

**Central public hub:** new `/legal` index page — a single, linkable "Centro de Documentos Legais" listing every *public* doc grouped by audience (Todos / Candidatos / Empresas), with search, effective dates, and a "what changed" link per doc. The existing scattered pages become entries in this hub. Footer + signup + checkout + portals all deep-link here.

**Storage model (replaces hardcoded TSX):** documents move to the DB so admins can edit and version them without a redeploy, and so **consent is provably tied to an exact version** — the legal core of "bulletproof."

- `LegalDocument` — `slug`, `title`, `category`, `audience` (public|employer|internal), `requires_acceptance` (bool), `current_version_id`.
- `LegalDocumentVersion` — `document_id`, `version_label` (e.g. `2026-07`), `body_markdown`, `effective_date`, `status` (draft|published|archived), `published_at`, `published_by`. Publishing a new version archives the prior one and stamps the effective date.
- Public pages render the **published** version (Markdown → sanitized HTML) inside the existing `LegalShell`. Internal docs render only inside admin.

**Admin management:** new admin section **"Documentos Legais"** under a new **"Legal & Conformidade"** sidebar group (super-admin only). Capabilities: list all docs, edit/create a draft version in a Markdown editor with live preview, publish (with effective-date + optional "notify users to re-accept"), view full version history + diff, and see per-version acceptance counts. Internal docs (security policy, dispute SOP, admin policy) manageable in the same place, flagged internal.

**Seeding:** a migration seeds all 14 documents at their initial published version from the finalized Markdown, so the system launches populated, and the current hardcoded `/termos` etc. are swapped to DB-rendered without a content gap.

---

## Part C — System build (waves, mirroring this repo's conventions)

One commit per lettered item, `security:`/`feat:`/`chore:` prefixes, branch `legal-and-payments`, verification gate after each (`pytest -q` backend / `npm run build && npm test` frontend), never leave the branch red.

### Wave L — Legal document CMS
- **L1** Models + migration: `LegalDocument`, `LegalDocumentVersion`, seed all 14 docs. Backend service + tests.
- **L2** Public rendering: `/legal` hub + DB-driven doc pages via `LegalShell`; migrate the 4 existing routes to DB; add the new public routes (cookies, consent, refunds, AUP, MSA, DPA). Markdown sanitization (reuse the XSS-safe pattern from this session).
- **L3** Admin "Documentos Legais": list, Markdown editor + preview, draft→publish, version history + diff, internal-vs-public gating. Super-admin only.
- **L4** Footer + cross-link overhaul: complete legal footer, sitemap entries, canonical tags, deep-links from signup/portals/checkout.

### Wave C — Consent & data-subject rights
- **C1** Consent versioning: extend the existing accepted-terms tracking to reference `LegalDocumentVersion` IDs; stamp version at signup + at each acceptance. Admin acceptance-audit view.
- **C2** Re-consent flow: when a `requires_acceptance` doc publishes a new version, prompt affected users on next login to review + re-accept; block gated actions until done (configurable per doc).
- **C3** DSAR (Data Subject Access Requests): self-service "export my data" (GDPR Art. 15/20) + "delete my account" (Art. 17) for candidates, mirroring the existing company-deletion-request queue; admin DSAR queue with SLA timers. Age/working-age acknowledgment at candidate signup.

### Wave P — Payment & subscription hardening
- **P1** Pre-purchase refund disclosure: checkout (employer + candidate) renders the Refund & Cancellation Policy and requires an explicit "li e aceito" acknowledgment (version-stamped) **before** a transaction is created. Blocks the current "pay first, no policy shown" gap.
- **P2** Cancellation flows: explicit user-initiated cancel for employer + candidate subscriptions with correct status transitions (`active→cancelled`), period-end handling, and confirmation emails. Candidate 14-day cooling-off honored automatically (full refund if within window and paid AI features unused; otherwise per policy).
- **P3** Refunds & receipts: `Refund` records + admin "process refund/reversal" action (marks transaction `refunded`, revokes/adjusts access per policy, emails the user). Sequential numbered **receipts/invoices** per paid transaction (accounting/tax), downloadable by the user and re-issuable by admin.
- **P4** Renewal lifecycle: expiry reminders (e.g. T-7/T-1 days), grace period, and dunning notices — replaces today's silent 30-day manual expiry. Reuses the existing scheduled-task + email-log infrastructure.

### Wave D — Dispute & chargeback-threshold system
- **D1** `PaymentDispute` entity: `transaction_id`, `raised_by`, `channel` (multicaixa|unitel|bank|manual|user_claim), `reason`, `status` (open|under_review|responded|resolved|refunded|rejected), `evidence` (JSON/files), `resolution`, timestamps. Admin dispute queue + detail view.
- **D2** Dispute response workflow: encode the SOP as status transitions; one-click insert of the **Dispute Response Template** (pre-filled from transaction + policy), evidence attachment, and resolution recording — every step written to the audit log.
- **D3** Chargeback/dispute-threshold alerts: a scheduled job computes the dispute rate (disputes ÷ paid transactions over a rolling window) per provider and overall; when it crosses a configurable threshold it raises a high-severity `SecurityEvent` and emails admins — **reusing the exact alert/cooldown pattern already built** in `security_service.py`. Admin-configurable threshold in Definições.

### Wave X — "Bulletproof" extras (UX + legal + management)
- **X1** Breach-notification runbook wired to the security policy: an internal incident-response checklist + a one-click "start breach clock" that logs the 72h GDPR deadline and tracks notification steps.
- **X2** "Os meus documentos" — a per-user page showing every agreement version they accepted, with dates and downloadable copies (proves informed consent; strong UX + legal).
- **X3** Granular cookie consent audit: ensure the existing banner logs category-level choices + policy version; surface a per-user cookie-consent record.
- **X4** Compliance dashboard in admin: at-a-glance — pending DSARs, users on stale consent versions, open disputes, dispute rate vs threshold, subscriptions expiring, refund volume. One screen for "are we legally healthy right now."

---

## Part D — Placement map (exact, per document)

| Document | Public route | In `/legal` hub | Shown at | Admin-managed | Requires acceptance |
|----------|-------------|:---:|----------|:---:|:---:|
| Privacy Policy | `/privacidade` | ✓ (Todos) | signup, footer | ✓ | ✓ (signup) |
| Terms of Service | `/termos` | ✓ (Todos) | signup, footer | ✓ | ✓ (signup) |
| Employer Terms | `/termos-empregador` | ✓ (Empresas) | employer signup | ✓ | ✓ (employer signup) |
| Cookie Policy | `/cookies` | ✓ (Todos) | cookie banner, footer | ✓ | banner ack |
| Data Retention | `/politica-retencao` | ✓ (Todos) | footer, privacy link | ✓ | — |
| CV & AI Consent | `/consentimento-cv-ia` | ✓ (Candidatos) | CV upload / AI activation | ✓ | ✓ (before AI parse) |
| **Refund Policy** | `/reembolsos` | ✓ (Todos) | **checkout (pre-payment)**, footer | ✓ | ✓ (at checkout) |
| Acceptable Use | `/utilizacao-aceitavel` | ✓ (Todos) | footer, ToS link | ✓ | — |
| **MSA** | `/legal/msa` | ✓ (Empresas) | employer onboarding, plan purchase | ✓ | ✓ (paid employer) |
| **DPA** | `/legal/dpa` | ✓ (Empresas) | employer onboarding | ✓ (+ per-employer signed PDF) | ✓ (paid employer) |
| **Security/Breach Policy** | — (internal) | — | admin only | ✓ (internal) | — |
| Admin Access Policy | — (internal) | — | admin onboarding | ✓ (internal) | admin ack |
| Dispute Template | — (internal) | — | dispute detail view | ✓ (internal) | — |
| Dispute Workflow SOP | — (internal) | — | admin runbook | ✓ (internal) | — |

---

## Suggested sequencing

`L1 → L2 → L3 → L4` (get the CMS + public hub live and populated) → `C1 → C2 → C3` (consent/DSAR) → `P1 → P2 → P3 → P4` (payments) → `D1 → D2 → D3` (disputes) → `X1 → X4` (extras). Documents (Part A) are drafted in parallel with L1 so the seed migration has real content.

## What I need from you to start
1. **Go-ahead** on this plan (and flag any wave you want dropped/reordered — e.g. if DSAR or MSA/DPA is out of scope for now).
2. The **`[[ENTITY_BLOCK]]`** details (registered name, NIF, address, contact emails).
3. Confirm the **"Cyber Liability"** interpretation (security/breach policy vs actual insurance disclosure).
4. Optional: any pricing/plan changes you want folded into Wave P while I'm in the billing code.
