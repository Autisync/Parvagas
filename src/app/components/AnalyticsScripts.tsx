"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { COOKIE_CONSENT_CHANGED_EVENT, hasAnalyticsConsent } from "@/lib/cookieConsent";

// Gates Plausible + Vercel Analytics behind cookie consent — cookies.md
// Section 2.2 names both explicitly as the "opcionais, requerem
// consentimento" category. Previously both loaded unconditionally in the
// root layout regardless of what the cookie banner recorded, so
// "Recusar opcionais" had no actual effect (Wave X3 gap fix).
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
    </>
  );
}
