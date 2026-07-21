"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import { fetchComplianceDashboard, type ComplianceDashboard } from "../adminClient";
import { AdminAlert, AdminPageHeader, AdminSpinner } from "../components/AdminUI";

function StatCard({
  title, value, tone = "default", href, sub,
}: {
  title: string;
  value: number | string | null;
  tone?: "default" | "warning" | "danger";
  href: string;
  sub?: string;
}) {
  const toneClass = tone === "danger"
    ? "border-red-300 bg-red-50"
    : tone === "warning"
    ? "border-amber-200 bg-amber-50"
    : "border-slate-200 bg-white";
  return (
    <Link href={href} className={`block rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${toneClass}`}>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value ?? "—"}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Link>
  );
}

export default function AdminComplianceDashboardPage() {
  const { token } = useAuth("admin");
  const [data, setData] = useState<ComplianceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchComplianceDashboard(token);
      setData(res);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar o painel de conformidade."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Legal & Conformidade"
        title="Painel de Conformidade"
        description="Visão agregada das áreas legais e de conformidade — cada indicador liga à respetiva fila de trabalho."
      />

      {error && <AdminAlert tone="error">{error}</AdminAlert>}
      {!data?.ok && !loading && !error && (
        <AdminAlert tone="warning">Alguns indicadores não puderam ser calculados neste momento — os valores em falta aparecem como &ldquo;—&rdquo;.</AdminAlert>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><AdminSpinner size="md" /></div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Análises de conformidade em aberto"
              value={data.complianceChecks.openTotal}
              tone={(data.complianceChecks.openHigh ?? 0) > 0 ? "danger" : (data.complianceChecks.openMedium ?? 0) > 0 ? "warning" : "default"}
              sub={`${data.complianceChecks.openHigh ?? 0} de severidade alta`}
              href="/Portal/Admin/compliance-analyzer"
            />
            <StatCard
              title="Pedidos de eliminação (DSAR) pendentes"
              value={data.dsar.pendingErasure}
              tone={(data.dsar.pendingErasure ?? 0) > 0 ? "warning" : "default"}
              sub={`${data.dsar.pendingExport ?? 0} exportações registadas`}
              href="/Portal/Admin/data-requests"
            />
            <StatCard
              title="Disputas de pagamento em aberto"
              value={data.disputes.open}
              tone={data.disputes.rate?.aboveThreshold ? "danger" : (data.disputes.open ?? 0) > 0 ? "warning" : "default"}
              sub={data.disputes.rate ? `Taxa ${ (data.disputes.rate.rate * 100).toFixed(1)}% (${data.disputes.rate.windowDays}d)` : undefined}
              href="/Portal/Admin/disputes"
            />
            <StatCard
              title="Incidentes de segurança em aberto"
              value={data.incidents.open}
              tone={data.incidents.breachesAwaitingNotification.length > 0 ? "danger" : (data.incidents.open ?? 0) > 0 ? "warning" : "default"}
              sub={data.incidents.breachesAwaitingNotification.length > 0 ? `${data.incidents.breachesAwaitingNotification.length} a aguardar notificação (72h)` : undefined}
              href="/Portal/Admin/security-incidents"
            />
            <StatCard
              title="Documentos legais publicados"
              value={data.legalDocuments.total}
              sub={`${data.legalDocuments.requiringAcceptance ?? 0} requerem aceitação`}
              href="/Portal/Admin/legal-documents"
            />
          </div>

          {data.incidents.breachesAwaitingNotification.length > 0 && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
              <h3 className="text-sm font-bold text-red-900">Violações a aguardar notificação à autoridade (Art. 33.º RGPD)</h3>
              <ul className="mt-3 space-y-2">
                {data.incidents.breachesAwaitingNotification.map((incident) => (
                  <li key={incident.id} className="flex items-center justify-between text-sm">
                    <Link href="/Portal/Admin/security-incidents" className="font-medium text-red-800 hover:underline">
                      {incident.title}
                    </Link>
                    <span className={`font-semibold ${incident.hoursRemaining != null && incident.hoursRemaining < 0 ? "text-red-700" : "text-amber-700"}`}>
                      {incident.hoursRemaining == null
                        ? "—"
                        : incident.hoursRemaining < 0
                        ? "Prazo ultrapassado"
                        : `${incident.hoursRemaining.toFixed(0)}h restantes`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
