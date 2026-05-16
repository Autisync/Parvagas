import { ReactNode } from "react";
import dynamic from "next/dynamic";
import OnboardingGuard from "./components/OnboardingGuard";
import Footer from "@/app/components/Footer";

const CandidateSidebar = dynamic(() => import("./components/CandidateSidebar"), {
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

export default function CandidatoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <OnboardingGuard>
        <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
          <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
            <CandidateSidebar />
            <section>{children}</section>
          </div>
        </main>
      </OnboardingGuard>
      <Footer />
    </div>
  );
}
