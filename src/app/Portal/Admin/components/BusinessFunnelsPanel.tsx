"use client";

import { useEffect, useState } from "react";
import { fetchBusinessFunnelsAnalytics, type BusinessFunnelsAnalytics } from "../adminClient";
import { AdminEmptyState } from "./AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { describeAnalyticsPanelError } from "./analyticsPanelError";

const TITLE = "Funis de negócio";
const SUBTITLE = "Aquisição de candidatos, SLA de moderação, qualidade de parsing de CV e crescimento da newsletter.";

/** Business-funnel rollups from data that already existed but was never
 * surfaced: signup->verified->first-application, moderation SLA, CV parse
 * failure rate, newsletter growth, and job spam-score distribution.
 * Fetches independently of the parent analytics page. */
export default function BusinessFunnelsPanel({ token }: { token: string }) {
  const [data, setData] = useState<BusinessFunnelsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBusinessFunnelsAnalytics(token)
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

  const { signupFunnel, moderationSla, cvParsing, newsletter, spamScoreDistribution } = data;
  const hasAnyData = signupFunnel.signups > 0 || moderationSla.sampleSize > 0 || newsletter.totalSubscribers > 0;

  return (
    <section className="app-card mt-6 p-4">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{TITLE}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{SUBTITLE}</p>

      {!hasAnyData ? (
        <div className="mt-4">
          <AdminEmptyState title="Sem dados ainda" description="Ainda não há dados suficientes para calcular os funis." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Registo → Verificação → 1ª candidatura ({signupFunnel.signups} candidato(s))
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">Registados: {signupFunnel.signups}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                Verificados: {signupFunnel.verified}{signupFunnel.verifiedRate != null ? ` (${signupFunnel.verifiedRate}%)` : ""}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                Candidataram-se: {signupFunnel.appliedAtLeastOnce}{signupFunnel.appliedRate != null ? ` (${signupFunnel.appliedRate}%)` : ""}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SLA de moderação de vagas</p>
            <p className="mt-2 text-xs text-slate-600">
              {moderationSla.sampleSize > 0 ? (
                <>Média: {moderationSla.avgHours}h · Mediana: {moderationSla.medianHours}h ({moderationSla.sampleSize} vaga(s) publicada(s))</>
              ) : (
                "Sem vagas publicadas ainda."
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parsing de CV</p>
            <p className="mt-2 text-xs text-slate-600">
              {cvParsing.completed + cvParsing.failed > 0 ? (
                <>{cvParsing.completed} concluído(s) · {cvParsing.failed} falhou(aram)
                  {cvParsing.failureRate != null ? ` — ${cvParsing.failureRate}% taxa de falha` : ""}</>
              ) : (
                "Sem CVs processados ainda."
              )}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Newsletter</p>
            <p className="mt-2 text-xs text-slate-600">
              {newsletter.activeSubscribers} ativo(s) de {newsletter.totalSubscribers} total — {newsletter.weeklySignups.reduce((s, w) => s + w.value, 0)} novo(s) nas últimas 8 semanas
            </p>
          </div>

          <div className="lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distribuição de pontuação de spam (vagas)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {spamScoreDistribution.map((bucket) => (
                <span key={bucket.label} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                  {bucket.label}: {bucket.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
