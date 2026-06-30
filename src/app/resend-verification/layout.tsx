import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reenviar Verificação",
  robots: { index: false, follow: false },
};

export default function ResendVerificationLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
