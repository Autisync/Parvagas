"use client";

import { useEffect } from "react";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

/**
 * Loads the Sentry browser SDK from CDN and initialises it — only when
 * NEXT_PUBLIC_SENTRY_DSN is set. Dependency-free (no @sentry/nextjs package).
 */
export default function SentryInit() {
  useEffect(() => {
    if (!DSN || typeof window === "undefined") return;
    if ((window as unknown as { Sentry?: unknown }).Sentry) return;
    const s = document.createElement("script");
    s.src = "https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js";
    s.crossOrigin = "anonymous";
    s.onload = () => {
      const Sentry = (window as unknown as { Sentry?: { init: (o: Record<string, unknown>) => void } }).Sentry;
      try {
        Sentry?.init({
          dsn: DSN,
          environment: process.env.NODE_ENV,
          tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
        });
      } catch {
        /* never let monitoring break the app */
      }
    };
    document.head.appendChild(s);
  }, []);
  return null;
}
