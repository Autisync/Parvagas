import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { getLegalDocuments, formatEffectiveDate, type LegalDocumentSummary } from "@/lib/legalContent";

export const metadata: Metadata = {
  title: "Documentos Legais",
  description: "Todos os documentos legais da Parvagas — privacidade, termos, cookies, reembolsos e acordos para empresas.",
  alternates: { canonical: "/legal" },
  robots: { index: true, follow: true },
};

const GROUPS: Array<{ key: LegalDocumentSummary["audience"]; label: string; hint: string }> = [
  { key: "public", label: "Para todos", hint: "Aplicável a qualquer pessoa que utilize a Parvagas" },
  { key: "employer", label: "Para empresas", hint: "Aplicável a contas empresariais e planos pagos" },
];

export default async function LegalHubPage() {
  const documents = await getLegalDocuments();

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-600">Parvagas</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Documentos Legais
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Todas as políticas e acordos que regem a utilização da Parvagas, sempre atualizados. Ao abrigo da Lei n.º
          22/11 (Angola) e, quando aplicável, do Regulamento Geral sobre a Proteção de Dados (RGPD).
        </p>

        <div className="mt-10 space-y-10">
          {GROUPS.map((group) => {
            const docs = documents.filter((d) => d.audience === group.key);
            if (docs.length === 0) return null;
            return (
              <section key={group.key} aria-labelledby={`group-${group.key}`}>
                <h2 id={`group-${group.key}`} className="text-lg font-bold text-slate-900">
                  {group.label}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{group.hint}</p>
                <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  {docs.map((doc) => (
                    <li key={doc.slug}>
                      <Link
                        href={doc.slug.startsWith("msa") || doc.slug.startsWith("dpa") ? `/legal/${doc.slug}` : `/${doc.slug}`}
                        className="flex flex-col gap-1 px-5 py-4 transition hover:bg-red-50/60 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span>
                          <span className="block text-[15px] font-semibold text-slate-900">{doc.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Em vigor desde {formatEffectiveDate(doc.effectiveDate)} · versão {doc.versionLabel}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-red-700">
                          Ler documento
                          <span aria-hidden>→</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Dúvidas legais ou de privacidade?</p>
          <p className="mt-1">
            Contacte{" "}
            <a href="mailto:privacidade@parvagas.pt" className="font-semibold text-red-700 hover:underline">
              privacidade@parvagas.pt
            </a>{" "}
            para questões de proteção de dados, ou{" "}
            <a href="mailto:suporte@parvagas.pt" className="font-semibold text-red-700 hover:underline">
              suporte@parvagas.pt
            </a>{" "}
            para outras questões.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
