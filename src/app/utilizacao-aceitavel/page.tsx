import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Política de Utilização Aceitável",
  description: "Regras de conduta aplicáveis a todos os utilizadores da plataforma Parvagas.",
  alternates: { canonical: "/utilizacao-aceitavel" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "O que não é permitido fazer na Parvagas — para candidatos, empresas e qualquer utilizador da plataforma — e como reportar uma violação.";

export default function UtilizacaoAceitavelPage() {
  return <LegalDocPage slug="utilizacao-aceitavel" subtitle={SUBTITLE} />;
}
