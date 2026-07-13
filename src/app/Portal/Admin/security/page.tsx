"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  fetchAdminMe,
  fetchSecurityEvents,
  toDateLabel,
  type AdminLevel,
  type Pagination,
  type SecurityEventRecord,
  type SecuritySummary,
} from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminPageHeader, AdminRestricted, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

const JsonBlock = dynamic(() => import("@/app/Portal/Admin/components/JsonBlock"), {
  ssr: false,
});

const EVENT_TYPE_LABELS: Record<string, string> = {
  failed_login: "Login falhado",
  login_burst: "Rajada de logins falhados",
  account_locked: "Conta bloqueada",
  email_rate_limit: "Limite de envio de emails",
  hibp_breach: "Conta em fuga de dados (HIBP)",
  alert_sent: "Alerta enviado",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export default function AdminSecurityPage() {
  const { token } = useAuth("admin");
  const [level, setLevel] = useState<AdminLevel>("super-admin");
  const [eventType, setEventType] = useState("");
  const [severity, setSeverity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [summary, setSummary] = useState<SecuritySummary | undefined>();
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const me = await fetchAdminMe(token);
      setLevel(me.adminLevel);
      if (me.adminLevel !== "super-admin") return;

      const res = await fetchSecurityEvents(token, { page, limit, eventType, severity, keyword });
      setEvents(res.securityEvents || []);
      setSummary(res.summary);
      setPagination(res.pagination);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar eventos de segurança."));
    }
  }, [token, page, limit, eventType, severity, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  if (level !== "super-admin") {
    return (
      <AdminRestricted title="Segurança restrita">
        Apenas super-admin pode consultar eventos de segurança.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Segurança"
        title="Eventos de Segurança"
        description="Logins falhados (com IP e user-agent), rajadas de força bruta, limites de envio de email e alertas enviados aos administradores."
      />

      {error ? <div className="mt-5"><InlineErrorState message={error} onAction={load} /></div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Eventos (últimas 24h)</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary?.last24hTotal ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs uppercase tracking-wide text-red-600">Severidade alta (24h)</p>
          <p className="mt-1 text-lg font-bold text-red-800">{summary?.last24hHigh ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs uppercase tracking-wide text-amber-600">Logins falhados (24h)</p>
          <p className="mt-1 text-lg font-bold text-amber-800">{summary?.last24hFailedLogins ?? "—"}</p>
        </div>
      </div>

      <AdminFilterBar>
        <input
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          placeholder="Pesquisar por email, IP ou detalhe"
          className={adminFieldClass}
        />
        <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }} className={adminFieldClass}>
          <option value="">Todos os tipos</option>
          <option value="failed_login">Login falhado</option>
          <option value="login_burst">Rajada de logins</option>
          <option value="account_locked">Conta bloqueada</option>
          <option value="email_rate_limit">Limite de emails</option>
          <option value="hibp_breach">Fuga de dados (HIBP)</option>
          <option value="alert_sent">Alerta enviado</option>
        </select>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className={adminFieldClass}>
          <option value="">Todas as severidades</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </select>
      </AdminFilterBar>

      <div className="mt-5 grid gap-3">
        {events.length === 0 && (
          <AdminEmptyState
            title="Sem eventos de segurança nesta vista"
            description="Bom sinal — nenhum evento corresponde aos filtros. Alertas de força bruta e de limite de email aparecem aqui automaticamente."
          />
        )}
        {events.map((event) => (
          <div key={event._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</p>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.low}`}>
                    {SEVERITY_LABELS[event.severity] || event.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {event.email ? <>Conta: <span className="font-medium text-slate-700">{event.email}</span> · </> : null}
                  {event.ipAddress ? <>IP: <span className="font-mono text-slate-700">{event.ipAddress}</span> · </> : null}
                  {toDateLabel(event.createdAt)}
                </p>
                {event.userAgent ? (
                  <p className="mt-1 max-w-xl truncate text-xs text-slate-400" title={event.userAgent}>
                    {event.userAgent}
                  </p>
                ) : null}
              </div>
              {event.details && Object.keys(event.details).length > 0 ? (
                <details className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 lg:max-w-xl">
                  <summary className="cursor-pointer list-none font-semibold text-slate-600">Ver detalhes JSON</summary>
                  <JsonBlock data={event.details} />
                </details>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <PaginationControls
        pagination={pagination}
        onPage={setPage}
        pageSize={limit}
        onPageSizeChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />
    </div>
  );
}
