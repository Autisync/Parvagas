import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Termos para Empregadores",
  description: "Condições de utilização da Parvagas para empresas e empregadores em Angola.",
  alternates: { canonical: "/termos-empregador" },
  robots: { index: true, follow: true },
};

export default async function TermosEmpregadorPage() {
  const dict = await getServerDictionary();
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.employerTermsTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.employerTermsBody}</p>
    </main>
  );
}
