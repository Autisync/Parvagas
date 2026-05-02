# Admin Analytics Extension Guide

This guide explains how to extend the Admin analytics dashboard without breaking RBAC or performance.

## Data Flow

- Backend endpoint: `GET /admin/analytics`
- Backend list endpoint for table widgets: `GET /admin/applications`
- Frontend data client: `src/app/Portal/Admin/adminClient.ts`
- Frontend page: `src/app/Portal/Admin/analytics/page.tsx`
- Lazy charts component: `src/app/Portal/Admin/components/AdminAnalyticsCharts.tsx`

Operational table endpoints support `sortBy` and `sortDir` query params for server-side sorting.

- `GET /admin/jobs?sortBy=createdAt|title|status|location&sortDir=asc|desc`
- `GET /admin/companies?sortBy=createdAt|name|verificationStatus&sortDir=asc|desc`
- `GET /admin/applications?sortBy=createdAt|status&sortDir=asc|desc`

## Response Contract

`/admin/analytics` returns:

- `range`: requested time window
- `totals`: top-level counters
- `operational`: moderation/compliance workload indicators
- `trends`: percent deltas vs previous window
- `series`: chart-ready time-series arrays (`{ label, value }`)
- `distributions`: pie/area/heatmap datasets
- `business`: super-admin business metrics only
- `cache`: cache metadata

When caller admin level is `moderator`, revenue/business fields are intentionally hidden.

## Adding a New KPI

1. Add computation in `server/controller/admin.js` inside `adminAnalytics`.
2. Add field to the analytics response payload.
3. Update `AnalyticsResponse` type in `adminClient.ts`.
4. Render KPI card in `analytics/page.tsx`.
5. Add integration assertions in `server/tests/integration.test.js`.

## Adding a New Chart

1. Shape series data in `adminAnalytics` as `{ label, value }[]`.
2. Add the type in `adminClient.ts`.
3. Render a chart widget in `AdminAnalyticsCharts.tsx`.
4. Keep charts in lazy-loaded component to avoid blocking first paint.

## RBAC Rules

- `super-admin`: full analytics including revenue/business metrics.
- `moderator`: operational analytics only.
- Guarding happens on both:
  - backend (`adminAnalytics` response shaping)
  - frontend (conditional widgets in `analytics/page.tsx`)

## Performance Notes

- Endpoint-level in-memory cache (45s TTL) is used in `adminAnalytics`.
- Keep expensive fetches scoped by date range.
- Prefer aggregate-friendly datasets and short series arrays.
- Avoid large payload joins in chart responses.

## Testing Checklist

- `npm run test` validates integration behavior.
- Validate moderator vs super-admin payload differences.
- Validate `/admin/applications` pagination shape.
- Manually test analytics page at desktop and mobile widths.
