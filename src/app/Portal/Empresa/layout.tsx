import { ReactNode } from "react";
import PortalTopBar from "@/app/Portal/components/PortalTopBar";

export default function EmpresaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <PortalTopBar role="company" />
      {children}
    </div>
  );
}
