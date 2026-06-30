import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Candidatar-se",
  robots: { index: false, follow: false },
};

export default function AplicarLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
