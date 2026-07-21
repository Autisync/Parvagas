import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Acordo de Processamento de Dados (DPA)",
  description:
    "Como a Parvagas trata os dados de candidatura que uma empresa empregadora recebe através da plataforma, nos termos do Art. 28.º do RGPD.",
  alternates: { canonical: "/legal/dpa" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Regula o tratamento, pela Parvagas, dos dados de candidatura que uma empresa recebe através da plataforma, nos termos do Art. 28.º do RGPD.";

export default function DpaPage() {
  return <LegalDocPage slug="dpa" subtitle={SUBTITLE} />;
}
