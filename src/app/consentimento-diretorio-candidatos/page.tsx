import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Consentimento — Diretório de Candidatos",
  description:
    "Consentimento que o candidato outorga à Parvagas para tornar o seu perfil visível e contactável por empresas no diretório de candidatos, antes de qualquer candidatura.",
  alternates: { canonical: "/consentimento-diretorio-candidatos" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "O que muda quando ativa a visibilidade do seu perfil, que empresas o podem ver e contactar, e como revogar este consentimento a qualquer momento.";

export default function ConsentimentoDiretorioCandidatosPage() {
  return <LegalDocPage slug="consentimento-diretorio-candidatos" subtitle={SUBTITLE} />;
}
