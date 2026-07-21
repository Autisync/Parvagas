import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como a Parvagas recolhe, usa e protege os dados pessoais de candidatos e empresas, em conformidade com a Lei 22/11 (Angola) e o RGPD (UE/Portugal).",
  alternates: { canonical: "/privacidade" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Esta política explica que dados pessoais recolhemos, com que finalidades e fundamentos legais os tratamos, com quem os partilhamos e quais os seus direitos enquanto titular dos dados.";

export default function PrivacidadePage() {
  return <LegalDocPage slug="privacidade" subtitle={SUBTITLE} />;
}
