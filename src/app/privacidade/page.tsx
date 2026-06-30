import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Parvagas recolhe, usa e protege os seus dados pessoais.",
  alternates: { canonical: "/privacidade" },
  robots: { index: true, follow: true },
};

export default async function PrivacidadePage() {
  const dict = await getServerDictionary();
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.privacyTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.privacyBody}</p>
    </main>
  );
}
