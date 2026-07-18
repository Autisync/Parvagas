"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { AdminEmptyState } from "./AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { describeAnalyticsPanelError } from "./analyticsPanelError";

type DemandAnalytics = {
  topSavedJobs: Array<{ jobId: string; title: string | null; saves: number }>;
  jobAlerts: { total: number; active: number };
  topAlertCategories: Array<{ label: string; value: number }>;
  topAlertKeywords: Array<{ label: string; value: number }>;
};

const TITLE = "Sinais de procura";
const SUBTITLE = "Vagas mais guardadas e volume/tópicos dos alertas de emprego dos candidatos.";

/** Read-only demand signals — most-saved jobs and JobAlert volume/top
 * categories/keywords, aggregated from existing tables (SavedJob,
 * JobAlert). Fetches independently of the parent analytics page. */
export default function DemandSignalsPanel({ token }: { token: string }) {
  const [data, setData] = useState<DemandAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<DemandAnalytics>("/admin/analytics/demand", token, { suppressGlobalErrors: true })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) { setData(null); setError(describeAnalyticsPanelError(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  if (loading) {
    return <div className="app-card mt-6 p-4"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>;
  }

  if (error) {
    return (
      <section className="app-card mt-6 p-4">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{TITLE}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{SUBTITLE}</p>
        <div className="mt-4">
          <InlineErrorState message={error} onAction={() => setReloadKey((k) => k + 1)} />
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const hasAnyData = data.topSavedJobs.length > 0 || data.jobAlerts.total > 0;

  return (
    <section className="app-card mt-6 p-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{TITLE}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{SUBTITLE}</p>

      {!hasAnyData ? (
        <div className="mt-4">
          <AdminEmptyState title="Sem sinais ainda" description="Ainda não há vagas guardadas ou alertas de emprego suficientes." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vagas mais guardadas</p>
            <div className="mt-2 space-y-1.5">
              {data.topSavedJobs.length === 0 ? (
                <p className="text-xs text-slate-500">Sem dados.</p>
              ) : (
                data.topSavedJobs.map((entry) => (
                  <div key={entry.jobId} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="truncate">{entry.title || entry.jobId}</span>
                    <span className="font-semibold text-slate-600">{entry.saves}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Alertas de emprego — {data.jobAlerts.active} ativo(s) de {data.jobAlerts.total}
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Categorias mais procuradas</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data.topAlertCategories.length === 0 ? (
                    <span className="text-xs text-slate-400">Sem dados</span>
                  ) : (
                    data.topAlertCategories.map((c) => (
                      <span key={c.label} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{c.label} ({c.value})</span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Palavras-chave mais procuradas</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data.topAlertKeywords.length === 0 ? (
                    <span className="text-xs text-slate-400">Sem dados</span>
                  ) : (
                    data.topAlertKeywords.map((k) => (
                      <span key={k.label} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{k.label} ({k.value})</span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
