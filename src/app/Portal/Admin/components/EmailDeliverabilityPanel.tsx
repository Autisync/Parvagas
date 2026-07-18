"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { AdminEmptyState } from "./AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { describeAnalyticsPanelError } from "./analyticsPanelError";

type EmailDeliverabilityAnalytics = {
  templates: Array<{ template: string; success: number; failed: number; total: number }>;
  recentFailures: Array<{ template: string; error: string; createdAt: string | null }>;
};

const TITLE = "Entregabilidade de emails";
const SUBTITLE = "Taxa de sucesso/falha de envio por template — os destinatários não são armazenados, apenas um hash.";

/** Per-template outbound email success/failure rollup (EmailLog — one row
 * per attempted send through send_templated_email) plus a short recent-
 * failures list for triage. Fetches independently of the parent analytics
 * page. */
export default function EmailDeliverabilityPanel({ token }: { token: string }) {
  const [data, setData] = useState<EmailDeliverabilityAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<EmailDeliverabilityAnalytics>("/admin/analytics/email-deliverability", token, { suppressGlobalErrors: true })
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

  const { templates, recentFailures } = data;
  const hasAnyData = templates.length > 0;

  return (
    <section className="app-card mt-6 p-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{TITLE}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{SUBTITLE}</p>

      {!hasAnyData ? (
        <div className="mt-4">
          <AdminEmptyState title="Sem dados ainda" description="Ainda não há envios de email registados." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Envios por template</p>
            <div className="mt-2 space-y-1.5">
              {templates.map((entry) => (
                <div key={entry.template} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="font-mono">{entry.template}</span>
                  <span className="text-slate-600">{entry.success} ok · {entry.failed} falhou</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Falhas recentes</p>
            <div className="mt-2 space-y-1.5">
              {recentFailures.length === 0 ? (
                <p className="text-xs text-slate-500">Sem falhas recentes.</p>
              ) : (
                recentFailures.map((failure, idx) => (
                  <div key={idx} className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-rose-800">{failure.template}</span>
                      {failure.createdAt ? <span className="shrink-0 text-rose-500">{new Date(failure.createdAt).toLocaleString("pt-PT")}</span> : null}
                    </div>
                    {failure.error ? <p className="mt-0.5 break-words text-rose-700">{failure.error}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
