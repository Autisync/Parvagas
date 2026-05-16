import { getServerDictionary } from "@/lib/i18n/server";

export default async function TermosEmpregadorPage() {
  const dict = await getServerDictionary();
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.employerTermsTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.employerTermsBody}</p>
    </main>
  );
}
