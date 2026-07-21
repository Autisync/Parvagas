import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Política de Cookies",
  description: "Que cookies e tecnologias semelhantes a Parvagas utiliza, e como gerir as suas preferências.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Explica o que são cookies, que categorias utilizamos em parvagas.pt, e como pode aceitar, recusar ou gerir as suas preferências a qualquer momento.";

export default function CookiesPage() {
  return <LegalDocPage slug="cookies" subtitle={SUBTITLE} />;
}
