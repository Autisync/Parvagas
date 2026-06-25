import { ReactNode } from "react";
import dynamic from "next/dynamic";
import OnboardingGuard from "./components/OnboardingGuard";
import Footer from "@/app/components/Footer";

const CandidateSidebar = dynamic(() => import("./components/CandidateSidebar"), {
  // Only show loading skeleton on desktop (sidebar hidden on mobile anyway)
  loading: () => <div className="hidden h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block" />,
});

export default function CandidatoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <OnboardingGuard>
        <main className="mx-auto max-w-7xl px-6 pb-24 pt-8 lg:pb-16">
          <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
            <CandidateSidebar />
            <section>{children}</section>
          </div>
        </main>
      </OnboardingGuard>
      <Footer />
    </div>
  );
}
