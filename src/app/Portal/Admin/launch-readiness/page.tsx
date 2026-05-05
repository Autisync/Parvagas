"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchLaunchReadiness,
  type LaunchReadinessCheck,
  type LaunchReadinessResponse,
} from "../adminClient";
import { AdminPageHeader, AdminRestricted, adminButtonClass, adminSecondaryButtonClass } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

function statusClass(status: LaunchReadinessCheck["status"]) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export default function AdminLaunchReadinessPage() {
  const { token, user } = useAuth("admin");
  const [report, setReport] = useState<LaunchReadinessResponse | null>(null);
  const [checkServices, setCheckServices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const adminLevel = useMemo(
    () => (user?.adminLevel === "moderator" ? "moderator" : "super-admin"),
    [user?.adminLevel]
  );

  const load = useCallback(
    async (withServices: boolean) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const data = await fetchLaunchReadiness(token, withServices);
        setReport(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao carregar readiness.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  if (adminLevel !== "super-admin") {
    return (
      <AdminRestricted title="Acesso restrito">
        Apenas super-admin pode ver readiness de lançamento.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Go-Live"
        title="Launch Readiness"
        description="Checklist técnico de ambiente e serviços para validar o estado de produção."
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => {
            setCheckServices(false);
            load(false);
          }}
          disabled={loading}
          className={adminButtonClass}
        >
          {loading && !checkServices ? "A validar..." : "Validar ambiente"}
        </button>
        <button
          onClick={() => {
            setCheckServices(true);
            load(true);
          }}
          disabled={loading}
          className={adminSecondaryButtonClass}
        >
          {loading && checkServices ? "A validar serviços..." : "Validar ambiente + serviços"}
        </button>
      </div>

      {report && (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total checks</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{report.summary.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Pass</p>
              <p className="mt-2 text-3xl font-bold text-emerald-800">{report.summary.pass}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-amber-700">Warn</p>
              <p className="mt-2 text-3xl font-bold text-amber-800">{report.summary.warn}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-rose-700">Fail</p>
              <p className="mt-2 text-3xl font-bold text-rose-800">{report.summary.fail}</p>
            </div>
          </section>

          <p className="mt-4 text-xs text-slate-500">Gerado em {new Date(report.generatedAt).toLocaleString("pt-PT")}</p>

          <section className="mt-4 space-y-3">
            {report.checks.map((check) => (
              <article key={check.id} className={`rounded-xl border p-4 ${statusClass(check.status)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{check.id}</p>
                  <span className="rounded-full border border-current px-2.5 py-0.5 text-xs font-semibold uppercase">{check.status}</span>
                </div>
                <p className="mt-2 text-sm">{check.message}</p>
                <p className="mt-1 text-xs uppercase tracking-wide opacity-80">{check.scope}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
