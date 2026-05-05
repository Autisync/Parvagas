"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ONBOARDING_KEY = "parvagas_onboarding_done";

export default function CandidatoPortalPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect new candidates to onboarding on first visit; returning users go to profile
    const done = typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY);
    router.replace(done ? "/Portal/Candidato/Meu-Perfil" : "/Portal/Candidato/Onboarding");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
    </div>
  );
}
