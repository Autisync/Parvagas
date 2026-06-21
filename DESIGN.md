# Parvagas — Design System & UI/UX Overhaul

Living reference for the premium UI/UX pass. Read this first when continuing the
overhaul (e.g. via `/loop`) so each iteration stays coherent.

## Identity
- **Brand color: red `#dc2626`** (preserved — do not rebrand). Full ramp `--brand-50…900`.
- Light theme, soft radial brand-tinted background. Voice: professional, friendly, premium.
- Language: Portuguese (pt-PT). Keep all copy in pt-PT.

## Tokens (src/app/globals.css)
- Color: brand ramp, neutrals (slate-based), semantic `success/warning/danger/info` (50/500/600/700).
- Surfaces: `--surface`, `--surface-muted`, `--surface-sunken`, borders soft/strong, text strong/muted/subtle.
- Radii `--radius-sm…3xl`; elevation `--shadow-xs…xl` + `--shadow-brand`; `--ring-brand`.
- Motion: easings `--ease-out-quart/quint/expo`; durations `--dur-fast/base/slow/slower`.
- Z-index scale: dropdown<sticky<modal-backdrop<modal<toast<tooltip<celebration. Never arbitrary.

## Utility classes (globals.css)
- Surfaces: `.app-card`, `.app-card-interactive` (hover lift), `.app-surface-muted`, `.app-divider`.
- Inputs: `.app-input` (brand focus ring). Buttons: `.app-btn-primary`, `.app-btn-secondary` (active press).
- Badges: `.app-badge` + `-success/-warning/-danger/-info/-neutral`.
- Loading: `.app-skeleton`, `.app-spinner`.
- Motion: `.pv-animate-in/-fade/-scale/-pop`, container `.pv-stagger`.

## Motion components (src/app/components/motion/)
- `SuccessCheck` — animated draw-in checkmark for completed actions.
- `MilestoneCelebration` — zero-dep canvas confetti (brand palette) for milestones.
- `AnimatedCounter` — count-up for stats (in-view, reduced-motion safe).
- `Reveal` — scroll reveal (content visible by default; never gates SSR content).
- `Skeleton` / `SkeletonText` — loading placeholders.
- `StatCard` — KPI tile (animated value + trend pill) for reporting.

All honor `prefers-reduced-motion`. Import via `@/app/components/motion`.

## When to use celebration vs. check
- `SuccessCheck`: routine completed action (saved, submitted, status changed).
- `MilestoneCelebration`: meaningful milestones — first application sent, profile
  100% complete, first job posted, application accepted, company verified.

## Rules (from impeccable)
- Contrast ≥4.5:1 body / ≥3:1 large. No gradient text, no side-stripe borders, no
  glassmorphism-by-default, no eyebrow-on-every-section, no nested cards.
- Flexbox for 1D, Grid for 2D. Animate transform/opacity, not layout.

## Progress log (append each loop iteration)
- [x] Phase 1 — Foundation: tokens + motion system in globals.css; motion component library; DESIGN.md. Typecheck clean.
- [ ] Phase 2 — Reporting UI: Portal/Admin/analytics + candidate/company dashboards (recharts + StatCard).
- [ ] Phase 3 — Completion/milestone animations wired into: Signup/success, Aplicar (apply), CV upload, job posted, onboarding complete, company verification.
- [ ] Phase 4 — Page polish: Login/Signup, Header/Footer, landing, Vagas-Disponiveis (list+detail), candidate & company portals.
- [ ] Phase 5 — Pass: a11y/contrast audit, responsive checks, final polish.

## Verification per phase
`npm run typecheck` (fast) after each batch; periodic `npm run build`. Commit per phase on branch `feat/ui-ux-premium-overhaul`.
