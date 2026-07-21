import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Política de Retenção de Dados",
  description:
    "Prazos de conservação e eliminação dos dados pessoais tratados pela Parvagas, em conformidade com a Lei 22/11 (Angola) e o RGPD.",
  alternates: { canonical: "/politica-retencao" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Prazos de conservação de cada categoria de dados pessoais e operacionais tratados pela Parvagas, e o que acontece a esses dados quando o prazo expira.";

export default function PoliticaRetencaoPage() {
  return <LegalDocPage slug="politica-retencao" subtitle={SUBTITLE} />;
}
