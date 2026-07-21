import type { ReactNode } from "react";
import Link from "next/link";
import Header from "../Header";
import Footer from "../Footer";

type LegalShellProps = {
  title: string;
  subtitle: string;
  effectiveDate: string;
  /** Version label of the currently published version (e.g. "2026-07"),
   * shown next to the effective date when the document is DB-backed. */
  versionLabel?: string;
  children: ReactNode;
};

/**
 * Shared presentation shell for the legal pages. Keeps a consistent, readable
 * document layout (title, effective date, prose typography) across every
 * document in the /legal registry.
 */
export default function LegalShell({ title, subtitle, effectiveDate, versionLabel, children }: LegalShellProps) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
        <Link
          href="/legal"
          className="text-sm font-semibold uppercase tracking-widest text-red-600 hover:text-red-700"
        >
          ← Parvagas · Documentos Legais
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">{subtitle}</p>
        <p className="mt-4 text-sm text-slate-500">
          Em vigor desde: <strong className="font-semibold text-slate-700">{effectiveDate}</strong>
          {versionLabel ? (
            <>
              {" "}
              · Versão <strong className="font-semibold text-slate-700">{versionLabel}</strong>
            </>
          ) : null}
        </p>

        <div className="legal-prose mt-10 space-y-8">{children}</div>

        <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Contacto para questões legais e de privacidade</p>
          <p className="mt-1">
            Encarregado de Proteção de Dados (DPO):{" "}
            <a href="mailto:privacidade@parvagas.pt" className="font-semibold text-red-700 hover:underline">
              privacidade@parvagas.pt
            </a>
          </p>
          <p className="mt-1">
            Autoridades de controlo: Agência de Proteção de Dados (APD, Angola) e Comissão Nacional de Proteção de Dados
            (CNPD, Portugal).
          </p>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          Este documento tem caráter informativo e não substitui aconselhamento jurídico. Em caso de conflito entre
          versões linguísticas, prevalece a versão em português.
        </p>
      </main>
      <Footer />
    </div>
  );
}

/** A numbered section with a heading. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold text-slate-900">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-slate-700">{children}</div>
    </section>
  );
}
