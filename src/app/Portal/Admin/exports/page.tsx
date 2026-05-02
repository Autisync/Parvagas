"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { downloadCsv, dateRangeQuery, fetchAdminMe, hasPermission, AdminPermissions, type AdminMe } from "../adminClient";
import { AdminPageHeader, AdminRestricted, adminButtonClass, adminFieldClass } from "../components/AdminUI";
import { useEffect } from "react";
import { useAppNotifier } from "@/app/components/AppNotifier";

function toInputDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default function AdminExportsPage() {
  const { token } = useAuth("admin");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [from, setFrom] = useState(toInputDate(30));
  const [to, setTo] = useState(toInputDate(0));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { notify } = useAppNotifier();

  const canExport = useMemo(() => hasPermission(me, AdminPermissions.EXPORT_USERS), [me]);

  useEffect(() => {
    if (!token) return;
    fetchAdminMe(token).then(setMe).catch(() => setMe(null));
  }, [token]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  const exportFile = async (kind: "users" | "jobs" | "companies") => {
    if (!token || !canExport) return;
    setBusy(kind);
    setError("");
    try {
      const query = dateRangeQuery(from, to);
      await downloadCsv(`/admin/exports/${kind}.csv${query}`, token, `parvagas-${kind}.csv`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao exportar CSV.");
    } finally {
      setBusy(null);
    }
  };

  if (!canExport) {
    return (
      <AdminRestricted title="Exportação restrita">
        Apenas super-admin pode exportar dados para CSV.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Exportações"
        title="Exportações CSV"
        description="Exporte dados operacionais com filtro por intervalo de datas."
      />

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Data inicial</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={adminFieldClass} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Data final</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={adminFieldClass} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => exportFile("users")} disabled={busy !== null} className={adminButtonClass}>
            {busy === "users" ? "A exportar..." : "Exportar utilizadores"}
          </button>
          <button onClick={() => exportFile("jobs")} disabled={busy !== null} className={adminButtonClass}>
            {busy === "jobs" ? "A exportar..." : "Exportar vagas"}
          </button>
          <button onClick={() => exportFile("companies")} disabled={busy !== null} className={adminButtonClass}>
            {busy === "companies" ? "A exportar..." : "Exportar empresas"}
          </button>
        </div>
      </section>
    </div>
  );
}
