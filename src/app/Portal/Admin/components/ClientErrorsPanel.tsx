"use client";

import { useEffect, useState } from "react";
import { fetchClientErrors, type ClientErrorLogRecord } from "../adminClient";
import { AdminEmptyState } from "./AdminUI";

const LEVEL_STYLES: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  error: "border-amber-200 bg-amber-50 text-amber-700",
  warning: "border-slate-200 bg-slate-50 text-slate-600",
};

/** Recent frontend runtime errors reported via the public
 * POST /api/v1/events/client-errors endpoint (src/lib/errorMonitoring.ts).
 * SECURITY: every field below is untrusted input from an unauthenticated
 * public endpoint — it is rendered as plain JSX text only. Never wire
 * dangerouslySetInnerHTML to any field on this panel. */
export default function ClientErrorsPanel({ token }: { token: string }) {
  const [errors, setErrors] = useState<ClientErrorLogRecord[]>([]);
  const [dailySeries, setDailySeries] = useState<Array<{ label: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchClientErrors(token, { limit: 10 })
      .then((res) => {
        if (cancelled) return;
        setErrors(res.errors || []);
        setDailySeries(res.dailySeries || []);
      })
      .catch(() => { if (!cancelled) { setErrors([]); setDailySeries([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <div className="app-card mt-6 p-4"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>;
  }

  const last14dTotal = dailySeries.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="app-card mt-6 p-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Erros do frontend</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Erros de runtime reportados pelo browser dos utilizadores — {last14dTotal} nos últimos 14 dias.
      </p>

      {errors.length === 0 ? (
        <div className="mt-4">
          <AdminEmptyState title="Sem erros registados" description="Ainda não foram reportados erros de frontend." />
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {errors.map((err) => (
            <div key={err._id} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[err.level] || LEVEL_STYLES.warning}`}>
                  {err.level}
                </span>
                {err.path ? <span className="font-mono text-slate-500">{err.path}</span> : null}
                {err.createdAt ? <span className="ml-auto shrink-0 text-slate-400">{new Date(err.createdAt).toLocaleString("pt-PT")}</span> : null}
              </div>
              <p className="mt-1 break-words text-slate-700">{err.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
