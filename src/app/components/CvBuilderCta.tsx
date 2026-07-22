"use client";

import { useRouter } from "next/navigation";
import { getUser } from "@/lib/api";
import { getCvBuilderDestination } from "@/lib/portalRouting";

/**
 * Homepage "Construtor de CV" CTA. Extracted from the server-rendered
 * homepage (src/app/page.tsx) since routing to the right destination
 * (candidates vs. other logged-in roles vs. anonymous visitors) needs a
 * client-side check — a bare href can't branch on auth state.
 */
export default function CvBuilderCta({ label, className }: { label: string; className: string }) {
  const router = useRouter();

  const open = () => {
    const role = getUser()?.role;
    router.push(getCvBuilderDestination(typeof role === "string" ? role : null));
  };

  return (
    <button type="button" onClick={open} className={className}>
      {label}
    </button>
  );
}
