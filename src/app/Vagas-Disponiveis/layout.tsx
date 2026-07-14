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
    // Explicit ref to the branded generated OG image (nested routes with their
    // own openGraph don't inherit the root file-based one).
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vagas Disponíveis em Angola | Parvagas",
    description: "Explore centenas de vagas de emprego em Angola.",
  },
};

export default function VagasLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
