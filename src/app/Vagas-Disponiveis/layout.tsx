import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Vagas Disponíveis",
  description: "Explore centenas de vagas de emprego em Angola. Filtre por área, localização e tipo de contrato na Parvagas.",
  alternates: { canonical: "/Vagas-Disponiveis" },
  openGraph: {
    title: "Vagas Disponíveis em Angola | Parvagas",
    description: "Explore centenas de vagas de emprego em Angola. Filtre por área, localização e tipo de contrato.",
    url: "/Vagas-Disponiveis",
    type: "website",
    siteName: "Parvagas",
  },
  twitter: {
    card: "summary",
    title: "Vagas Disponíveis em Angola | Parvagas",
    description: "Explore centenas de vagas de emprego em Angola.",
  },
};

export default function VagasLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
