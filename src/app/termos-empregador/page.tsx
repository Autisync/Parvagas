import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Termos para Empregadores",
  description:
    "Condições de utilização da Parvagas por empresas: publicação de vagas, verificação, tratamento de dados de candidatos e não discriminação, ao abrigo da LGT (Angola) e do RGPD.",
  alternates: { canonical: "/termos-empregador" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Condições adicionais aplicáveis às empresas e recrutadores que utilizam a Parvagas para publicar vagas e aceder a candidaturas. Complementam os Termos e Condições gerais.";

export default function TermosEmpregadorPage() {
  return <LegalDocPage slug="termos-empregador" subtitle={SUBTITLE} />;
}
