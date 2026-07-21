import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Consentimento — CV e Inteligência Artificial",
  description:
    "Consentimentos que o candidato outorga à Parvagas para o tratamento do CV e o processamento por inteligência artificial na criação do perfil.",
  alternates: { canonical: "/consentimento-cv-ia" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Como o seu CV é lido e processado, o que a inteligência artificial da Parvagas faz com ele, e as garantias de revisão humana antes de qualquer conteúdo gerado ser guardado ou partilhado.";

export default function ConsentimentoCvIaPage() {
  return <LegalDocPage slug="consentimento-cv-ia" subtitle={SUBTITLE} />;
}
