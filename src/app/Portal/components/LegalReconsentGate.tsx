"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, getToken, getUser } from "@/lib/api";

type PendingDoc = {
  slug: string;
  title: string;
  versionId: string;
  versionLabel: string;
};

// Special-cased routing for the two legal docs that live under /legal/*
// instead of at the site root — mirrors src/app/legal/page.tsx.
function docHref(slug: string): string {
  if (slug === "msa" || slug === "dpa") return `/legal/${slug}`;
  return `/${slug}`;
}

export default function LegalReconsentGate({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingDoc[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getToken();
      const user = getUser();
      if (!token || !user) {
        setChecked(true);
        return;
      }
      try {
        const res = await authFetch<{ pendingAcceptances: PendingDoc[] }>(
          "/legal/my-pending-acceptances",
          token,
          { suppressGlobalErrors: true }
        );
        if (!cancelled) setPending(res.pendingAcceptances || []);
      } catch {
        // Fail-open — a network hiccup or an outdated deployed backend must
        // never lock someone out of their own portal over a compliance gate.
        if (!cancelled) setPending([]);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptAll = async () => {
    const token = getToken();
    if (!token || !pending || pending.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      for (const doc of pending) {
        await authFetch("/legal/acceptances", token, {
          method: "POST",
          body: JSON.stringify({ slug: doc.slug, context: "reconsent" }),
          suppressGlobalErrors: true,
        });
      }
      setPending([]);
    } catch {
      setError("Não foi possível registar a sua aceitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!checked || !pending || pending.length === 0) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-reconsent-title"
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="legal-reconsent-title" className="text-lg font-semibold text-slate-900">
            Atualizámos os nossos documentos legais
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Para continuar a usar o Parvagas, reveja e aceite as versões atualizadas dos
            seguintes documentos:
          </p>

          <ul className="mt-4 space-y-2">
            {pending.map((doc) => (
              <li
                key={doc.slug}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="text-sm text-slate-800">{doc.title}</span>
                <Link
                  href={docHref(doc.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Ler versão {doc.versionLabel}
                </Link>
              </li>
            ))}
          </ul>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            Confirmo que li e aceito as políticas atualizadas
          </label>

          <button
            type="button"
            disabled={!confirmed || submitting}
            onClick={acceptAll}
            className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "A confirmar..." : "Continuar"}
          </button>
        </div>
      </div>
    </>
  );
}
