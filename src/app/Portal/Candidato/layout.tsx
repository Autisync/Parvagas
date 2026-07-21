import { ReactNode } from "react";
import dynamic from "next/dynamic";
import OnboardingGuard from "./components/OnboardingGuard";
import Footer from "@/app/components/Footer";
import PortalTopBar from "@/app/Portal/components/PortalTopBar";
import LegalReconsentGate from "@/app/Portal/components/LegalReconsentGate";

// Owns the fixed left dock AND the matching content offset (see the
// component for why those must live together). SSR-loading fallback
// mirrors the collapsed-by-default-on-builder-route width isn't knowable
// server-side, so it just reserves the expanded width to avoid a bigger
// jump than a live client would ever produce.
const CandidatePortalShell = dynamic(() => import("./components/CandidateSidebar"), {
  loading: () => <div className="lg:pl-[260px]" />,
});

export default function CandidatoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <PortalTopBar role="candidate" />
      <LegalReconsentGate>
        <OnboardingGuard>
          <CandidatePortalShell>
            <main className="mx-auto max-w-7xl px-6 pb-24 pt-8 lg:pb-16">
              <section>{children}</section>
            </main>
            <Footer />
          </CandidatePortalShell>
        </OnboardingGuard>
      </LegalReconsentGate>
    </div>
  );
}
