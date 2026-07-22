"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { COOKIE_CONSENT_CHANGED_EVENT, hasAnalyticsConsent } from "@/lib/cookieConsent";

// Gates Plausible + Vercel Analytics + Vercel Speed Insights behind cookie
// consent — cookies.md Section 2.2 covers this as "Cookies de Performance e
// Análise (Opcionais)", naming Plausible/Vercel Analytics as examples of the
// category; Speed Insights is the same kind of performance measurement from
// the same vendor, so it belongs behind the same gate. Previously Analytics
// loaded unconditionally in the root layout regardless of what the cookie
// banner recorded, so "Recusar opcionais" had no actual effect (Wave X3 gap
// fix) — new scripts must not regress that.
export default function AnalyticsScripts() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(hasAnalyticsConsent());
    const onChange = () => setEnabled(hasAnalyticsConsent());
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange);
  }, []);

  if (!enabled) return null;

  return (
    <>
      {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? (
        <Script
          strategy="afterInteractive"
          defer
          data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
          src={`${process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io"}/js/script.tagged-events.js`}
        />
      ) : null}
      <Analytics />
      <SpeedInsights />
    </>
  );
}
