import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Termos e Condições",
  description:
    "Termos e condições de utilização da plataforma Parvagas por candidatos e utilizadores, ao abrigo da lei angolana e portuguesa.",
  alternates: { canonical: "/termos" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Estas condições regem o acesso e a utilização da plataforma Parvagas por candidatos e utilizadores em geral. Ao criar conta ou utilizar a plataforma, aceita estes termos.";

export default function TermosPage() {
  return <LegalDocPage slug="termos" subtitle={SUBTITLE} />;
}
