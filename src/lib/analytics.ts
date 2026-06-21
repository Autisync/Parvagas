// Lightweight, privacy-friendly analytics wrapper.
// Pageviews are auto-tracked by the Plausible script (added in layout when
// NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set). This helper fires funnel/conversion
// events. No-ops safely when analytics isn't configured.

type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props }) => void;
  }
}

/** Funnel events we care about across the candidate/employer journeys. */
export type FunnelEvent =
  | "job_view"
  | "job_search"
  | "apply_start"
  | "apply_success"
  | "job_saved"
  | "alert_created"
  | "register_success"
  | "company_job_posted"
  | "subscribe_start";

export function track(event: FunnelEvent, props?: Props): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    /* never let analytics break UX */
  }
}
