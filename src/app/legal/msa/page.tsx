import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Acordo de Prestação de Serviços (MSA)",
  description: "Condições comerciais aplicáveis a empresas empregadoras com um plano pago na Parvagas.",
  alternates: { canonical: "/legal/msa" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Condições comerciais — preço, faturação, prazo, nível de serviço e confidencialidade — aplicáveis a empresas com um plano pago na Parvagas.";

export default function MsaPage() {
  return <LegalDocPage slug="msa" subtitle={SUBTITLE} />;
}
