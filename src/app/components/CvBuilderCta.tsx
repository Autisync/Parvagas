"use client";

import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

/**
 * Homepage "Construtor de CV" CTA. Extracted from the server-rendered
 * homepage (src/app/page.tsx) since routing to the right destination
 * (logged-in candidates vs. anonymous visitors) needs a client-side check —
 * a bare href can't branch on auth state.
 */
export default function CvBuilderCta({ label, className }: { label: string; className: string }) {
  const router = useRouter();

  const open = () => {
    router.push(getToken() ? "/Portal/Candidato/Construtor-CV" : "/Submission#criar-cv");
  };

  return (
    <button type="button" onClick={open} className={className}>
      {label}
    </button>
  );
}
