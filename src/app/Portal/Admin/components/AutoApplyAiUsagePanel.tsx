"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { AdminEmptyState } from "./AdminUI";

type AutoApplyAnalytics = {
  autoApplyFunnel: {
    total: number;
    pending: number;
    approved: number;
    dismissed: number;
    expired: number;
    approvalRate: number | null;
  };
  llmUsage: Array<{ feature: string; success: number; failed: number; total: number }>;
};

/** Auto-apply funnel (JobMatchProposal — a "propose then approve" queue)
 * and AI usage metering (LlmCallLog, per-feature call counts). Fetches
 * independently of the parent analytics page. */
export default function AutoApplyAiUsagePanel({ token }: { token: string }) {
  const [data, setData] = useState<AutoApplyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch<AutoApplyAnalytics>("/admin/analytics/auto-apply", token, { suppressGlobalErrors: true })
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <div className="app-card mt-6 p-4"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>;
  }

  if (!data) {
    return null;
  }

  const { autoApplyFunnel, llmUsage } = data;
  const hasAnyData = autoApplyFunnel.total > 0 || llmUsage.length > 0;

  return (
    <section className="app-card mt-6 p-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">Auto-apply e utilização de IA</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Funil de propostas de candidatura automática e chamadas ao modelo de IA por funcionalidade.</p>

      {!hasAnyData ? (
        <div className="mt-4">
          <AdminEmptyState title="Sem dados ainda" description="Ainda não há propostas de auto-apply nem chamadas de IA registadas." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Funil de auto-apply — {autoApplyFunnel.total} proposta(s)
              {autoApplyFunnel.approvalRate != null ? ` · ${autoApplyFunnel.approvalRate}% aprovação` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">Pendentes: {autoApplyFunnel.pending}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Aprovadas: {autoApplyFunnel.approved}</span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Dispensadas: {autoApplyFunnel.dismissed}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">Expiradas: {autoApplyFunnel.expired}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chamadas de IA por funcionalidade</p>
            <div className="mt-2 space-y-1.5">
              {llmUsage.length === 0 ? (
                <p className="text-xs text-slate-500">Sem chamadas registadas.</p>
              ) : (
                llmUsage.map((entry) => (
                  <div key={entry.feature} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="font-mono">{entry.feature}</span>
                    <span className="text-slate-600">{entry.success} ok · {entry.failed} falhou</span>
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
