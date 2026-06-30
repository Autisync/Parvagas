import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Criar Conta",
  description: "Registe-se na Parvagas.",
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
