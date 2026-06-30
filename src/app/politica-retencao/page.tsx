import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Política de Retenção de Dados",
  description: "Política de retenção e eliminação de dados pessoais na plataforma Parvagas.",
  alternates: { canonical: "/politica-retencao" },
  robots: { index: true, follow: true },
};

export default async function RetencaoPage() {
  const dict = await getServerDictionary();

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.retentionTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.retentionBody}</p>
    </main>
  );
}
