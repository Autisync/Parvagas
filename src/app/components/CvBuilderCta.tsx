"use client";

import { useState } from "react";
import { buildResumeBuilderSsoUrl } from "@/lib/resumeBuilder";

/**
 * Homepage "Construtor de CV" CTA. Extracted from the server-rendered
 * homepage (src/app/page.tsx) since minting the SSO handoff code needs an
 * authenticated client-side fetch — a bare href can't do that.
 */
export default function CvBuilderCta({ label, className }: { label: string; className: string }) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = await buildResumeBuilderSsoUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={open} disabled={loading} className={className}>
      {label}
    </button>
  );
}
