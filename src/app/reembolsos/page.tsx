import type { Metadata } from "next";
import LegalDocPage from "@/app/components/legal/LegalDocPage";

export const metadata: Metadata = {
  title: "Política de Reembolsos e Cancelamento",
  description:
    "Regras de reembolso e cancelamento para planos de Empresa e do CV Builder na Parvagas, incluindo o direito de livre resolução de 14 dias para consumidores da UE.",
  alternates: { canonical: "/reembolsos" },
  robots: { index: true, follow: true },
};

const SUBTITLE =
  "Quando um pagamento é reembolsável, como cancelar uma subscrição, e como reportar um problema com um pagamento — antes de confirmar qualquer compra na Parvagas.";

export default function ReembolsosPage() {
  return <LegalDocPage slug="reembolsos" subtitle={SUBTITLE} />;
}
