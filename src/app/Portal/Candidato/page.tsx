"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /Portal/Candidato has no content of its own — it's the landing route the
 * app redirects to after login. Dashboard is the primary destination.
 *
 * This used to gate on a localStorage flag ("parvagas_onboarding_done")
 * that nothing else in the codebase ever set, so it always read as
 * missing and sent every visitor to Onboarding, even fully set-up
 * returning candidates. That check was redundant anyway: OnboardingGuard
 * already wraps the whole /Portal/Candidato layout and redirects to
 * Onboarding itself for any account with hasCompletedOnboarding false, so
 * this page can just go straight to Dashboard and let the guard handle it.
 */
export default function CandidatoPortalPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/Portal/Candidato/Dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
    </div>
  );
}
