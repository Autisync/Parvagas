"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authFetch, getToken, getUser, setUser } from "@/lib/api";
import TutorialModal from "./TutorialModal";

// ── Inner component — isolated so Suspense can wrap only this part ────────────

function GuardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialToken, setTutorialToken] = useState<string | null>(null);
  const [isReplay, setIsReplay] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getToken();
      const user = getUser();

      if (!token || !user || user.role !== "candidate") {
        setChecked(true);
        return;
      }

      const forceReplay = searchParams?.get("tutorial") === "1";
      let hasSeenTutorial = user.hasSeenTutorial;
      let hasCompletedOnboarding = user.hasCompletedOnboarding;

      // The localStorage snapshot is taken once at login and can go stale
      // (flags flip server-side in another tab/session, or a login path
      // stored the user object before onboarding state was known) — that's
      // what caused these prompts to reappear on logins after the candidate
      // had already finished them. Only worth a network round-trip when the
      // snapshot actually claims something is pending; re-verify against the
      // server before trusting it, and update the snapshot either way so a
      // fixed flag doesn't ask again next load.
      if (!forceReplay && (hasSeenTutorial === false || hasCompletedOnboarding === false)) {
        try {
          const fresh = await authFetch<{
            profile?: { hasSeenTutorial?: boolean; hasCompletedOnboarding?: boolean };
          }>("/candidates/profile", token, { suppressGlobalErrors: true });
          if (fresh.profile) {
            hasSeenTutorial = fresh.profile.hasSeenTutorial ?? hasSeenTutorial;
            hasCompletedOnboarding = fresh.profile.hasCompletedOnboarding ?? hasCompletedOnboarding;
            setUser({ ...user, hasSeenTutorial, hasCompletedOnboarding });
          }
        } catch {
          // Network hiccup — fall back to the (possibly stale) snapshot
          // rather than blocking the guard entirely.
        }
      }

      if (cancelled) return;

      if (forceReplay || hasSeenTutorial === false) {
        setTutorialToken(token as string);
        setIsReplay(forceReplay);
        setShowTutorial(true);
        setChecked(true);
        return;
      }

      // Tutorial already seen — check if profile onboarding is still needed
      if (
        hasCompletedOnboarding === false &&
        !pathname?.startsWith("/Portal/Candidato/Onboarding")
      ) {
        router.replace("/Portal/Candidato/Onboarding");
      }

      setChecked(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTutorialDone = useCallback(() => {
    setShowTutorial(false);

    const wasReplay = searchParams?.get("tutorial") === "1";

    if (wasReplay) {
      // Replay from Settings — strip the query param and stay on current page
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tutorial");
      const next = params.toString() ? `${pathname}?${params.toString()}` : pathname || "";
      router.replace(next);
      return;
    }

    // First-time tutorial completion → always go to profile setup next
    router.replace("/Portal/Candidato/Onboarding");
  }, [pathname, router, searchParams]);

  return (
    <>
      {checked && children}
      {showTutorial && tutorialToken && (
        <TutorialModal
          token={tutorialToken}
          onDone={handleTutorialDone}
          forceReplay={isReplay}
        />
      )}
    </>
  );
}

// ── Public wrapper — Suspense boundary required by Next.js for useSearchParams ─

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  return (
    // Fallback must NOT render `children` — Next.js briefly renders this
    // fallback during the client-side bailout `useSearchParams()` requires,
    // which mounted the same `children` element tree here and then again
    // inside `GuardInner` a moment later. Two mounts of the same subtree at
    // different fiber positions within milliseconds of each other is what
    // caused a production "insertBefore" NotFoundError crash on this route
    // (React's commit phase tries to move/insert a DOM node relative to a
    // sibling that a still-in-flight prior commit already detached).
    <Suspense fallback={null}>
      <GuardInner>{children}</GuardInner>
    </Suspense>
  );
}
