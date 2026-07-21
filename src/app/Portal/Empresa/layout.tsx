import { ReactNode } from "react";
import dynamic from "next/dynamic";
import PortalTopBar from "@/app/Portal/components/PortalTopBar";
import LegalReconsentGate from "@/app/Portal/components/LegalReconsentGate";

// Owns the fixed left dock AND the matching content offset (see the
// component for why those must live together). SSR-loading fallback
// reserves the expanded width to avoid a bigger jump than a live client
// would ever produce.
const CompanyPortalShell = dynamic(() => import("./components/CompanySidebar"), {
  loading: () => <div className="lg:pl-[260px]" />,
});

export default function EmpresaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <PortalTopBar role="company" />
      <LegalReconsentGate>
        <CompanyPortalShell>{children}</CompanyPortalShell>
      </LegalReconsentGate>
    </div>
  );
}
