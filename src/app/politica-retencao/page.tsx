import { getServerDictionary } from "@/lib/i18n/server";

export default function RetencaoPage() {
  const dict = getServerDictionary();

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">{dict.legal.retentionTitle}</h1>
      <p className="mt-4 text-gray-700">{dict.legal.retentionBody}</p>
    </main>
  );
}
