"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DocumentCheckIcon } from "@heroicons/react/24/outline";
import { authFetch, getToken } from "@/lib/api";

type Acceptance = {
  id: string;
  slug: string;
  title: string;
  category: string;
  versionLabel: string;
  isCurrentVersion: boolean;
  context: string | null;
  acceptedAt: string | null;
};

const CONTEXT_LABEL: Record<string, string> = {
  signup: "Registo",
  reconsent: "Reaceitação",
  employer_invite: "Convite de empresa",
  cv_ai_consent: "Consentimento IA",
};

// Special-cased routing for the two legal docs that live under /legal/*
// instead of at the site root — mirrors src/app/legal/page.tsx.
function docHref(slug: string): string {
  if (slug === "msa" || slug === "dpa") return `/legal/${slug}`;
  return `/${slug}`;
}

export default function LegalAcceptanceHistory() {
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authFetch<{ acceptances: Acceptance[] }>("/legal/my-acceptances", token, { suppressGlobalErrors: true })
      .then((res) => setAcceptances(res.acceptances || []))
      .catch(() => setError("Não foi possível carregar o histórico de documentos aceites."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <DocumentCheckIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Os meus documentos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Histórico dos documentos legais que aceitou nesta conta — o documento, a versão e a data.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">A carregar...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      ) : acceptances.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Ainda não há registos de aceitação nesta conta.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {acceptances.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {a.title}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    v{a.versionLabel}{!a.isCurrentVersion ? " · versão desatualizada" : ""}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Aceite em {a.acceptedAt ? new Date(a.acceptedAt).toLocaleString("pt-PT") : "—"}
                  {a.context ? ` · ${CONTEXT_LABEL[a.context] || a.context}` : ""}
                </p>
              </div>
              <Link
                href={docHref(a.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Ler documento
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
