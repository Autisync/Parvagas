import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Termos e Condições",
  description: "Termos e condições de utilização da plataforma Parvagas.",
  alternates: { canonical: "/termos" },
  robots: { index: true, follow: true },
};

export default async function TermosPage() {
  const dict = await getServerDictionary();
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.termsTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.termsBody}</p>
    </main>
  );
}
