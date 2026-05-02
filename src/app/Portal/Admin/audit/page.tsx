"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import JsonBlock from "@/app/Portal/Admin/components/JsonBlock";
import {
  fetchAdminActions,
  fetchAdminMe,
  fetchAuditLogs,
  toDateLabel,
  type AdminActionRecord,
  type AdminLevel,
  type AuditLogRecord,
  type Pagination,
} from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminPageHeader, AdminRestricted, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages, collectSelectedItemsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";

type Tab = "audit" | "admin-actions";

export default function AdminAuditPage() {
  const { token } = useAuth("admin");
  const [level, setLevel] = useState<AdminLevel>("super-admin");
  const [tab, setTab] = useState<Tab>("audit");
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [adminActions, setAdminActions] = useState<AdminActionRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { notify } = useAppNotifier();

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const me = await fetchAdminMe(token);
      setLevel(me.adminLevel);
      if (me.adminLevel !== "super-admin") return;

      if (tab === "audit") {
        const res = await fetchAuditLogs(token, { page, limit, keyword, action, resourceType });
        setAuditLogs(res.auditLogs || []);
        setPagination(res.pagination);
      } else {
        const res = await fetchAdminActions(token, { page, limit, keyword, action, targetType: resourceType });
        setAdminActions(res.adminActions || []);
        setPagination(res.pagination);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar auditoria."));
    }
  }, [token, tab, page, limit, keyword, action, resourceType]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
  }, [error, notify]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const currentItems = useMemo(() => (tab === "audit" ? auditLogs : adminActions), [tab, auditLogs, adminActions]);
  const {
    selectedIds,
    allVisibleSelected,
    toggleSelect,
    toggleVisible,
    clearSelection,
    replaceSelection,
  } = useBulkSelection(currentItems.map((entry) => entry._id));

  const clearSelectionState = () => {
    clearSelection();
  };

  const selectAllAcrossPages = async () => {
    if (!token) return;
    setError("");
    try {
      const ids = await collectAllIdsAcrossPages<AuditLogRecord | AdminActionRecord>({
        fetchPage: async (currentPage) => {
          if (tab === "audit") {
            const res = await fetchAuditLogs(token, { page: currentPage, limit: 100, keyword, action, resourceType });
            return { items: res.auditLogs || [], totalPages: res.pagination?.totalPages || 1 };
          }
          const res = await fetchAdminActions(token, { page: currentPage, limit: 100, keyword, action, targetType: resourceType });
          return { items: res.adminActions || [], totalPages: res.pagination?.totalPages || 1 };
        },
        getId: (entry) => entry._id,
      });

      replaceSelection(ids);
      setNotice(`${ids.length} ${tab === "audit" ? "registos de auditoria" : "admin actions"} selecionados em todas as páginas.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível selecionar todos os registos filtrados."));
    }
  };

  const fetchSelectedEntries = async () => {
    if (!token || selectedIds.length === 0) return [] as Array<AuditLogRecord | AdminActionRecord>;
    return collectSelectedItemsAcrossPages<AuditLogRecord | AdminActionRecord>({
      selectedIds,
      fetchPage: async (currentPage) => {
        if (tab === "audit") {
          const res = await fetchAuditLogs(token, { page: currentPage, limit: 100, keyword, action, resourceType });
          return { items: res.auditLogs || [], totalPages: res.pagination?.totalPages || 1 };
        }
        const res = await fetchAdminActions(token, { page: currentPage, limit: 100, keyword, action, targetType: resourceType });
        return { items: res.adminActions || [], totalPages: res.pagination?.totalPages || 1 };
      },
      getId: (entry) => entry._id,
    });
  };

  const copySelectedIds = async () => {
    if (selectedIds.length === 0) return;
    try {
      await navigator.clipboard.writeText(selectedIds.join("\n"));
      setNotice(`${selectedIds.length} IDs copiados.`);
    } catch {
      setError("Não foi possível copiar os IDs selecionados.");
    }
  };

  const exportSelected = async () => {
    if (selectedIds.length === 0) return;
    setError("");
    try {
      const rows = await fetchSelectedEntries();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${tab}-selecionados.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
      setNotice(`${rows.length} registos exportados.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível exportar os registos selecionados."));
    }
  };

  if (level !== "super-admin") {
    return (
      <AdminRestricted title="Auditoria restrita">
        Apenas super-admin pode consultar logs de ações privilegiadas.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Auditoria"
        title="Ações Privilegiadas"
        description="Inspecione alterações sensíveis, moderação, acessos e operações administrativas."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => { setTab("audit"); setPage(1); clearSelectionState(); }}
          aria-pressed={tab === "audit"}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${tab === "audit" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          Audit logs
        </button>
        <button
          onClick={() => { setTab("admin-actions"); setPage(1); clearSelectionState(); }}
          aria-pressed={tab === "admin-actions"}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${tab === "admin-actions" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          Admin actions
        </button>
      </div>

      <AdminFilterBar>
        <input value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Pesquisar logs" className={adminFieldClass} />
        <input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Filtrar por ação" className={adminFieldClass} />
        <input value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(1); clearSelectionState(); }} placeholder={tab === "audit" ? "Resource type" : "Target type"} className={adminFieldClass} />
      </AdminFilterBar>

      {currentItems.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleVisible} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
              </button>
              {(pagination?.total || 0) > currentItems.length ? (
                <button type="button" onClick={selectAllAcrossPages} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100">
                  Selecionar todos os {pagination?.total || 0} resultados
                </button>
              ) : null}
            </div>
            {selectedIds.length > 0 ? <p className="text-sm font-semibold text-slate-700">{selectedIds.length} registos selecionados</p> : null}
          </div>

          {selectedIds.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={copySelectedIds} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Copiar IDs</button>
              <button type="button" onClick={exportSelected} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Exportar JSON</button>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Registos visíveis</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{currentItems.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Selecionados</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{selectedIds.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total filtrado</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{pagination?.total || 0}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-3">
        {tab === "audit" && auditLogs.length === 0 && <AdminEmptyState title="Sem audit logs nesta vista" description="Ajuste os filtros ou aguarde novos eventos." />}
        {tab === "audit" && auditLogs.map((log) => (
          <div key={log._id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${selectedIds.includes(log._id) ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <label className="mt-1 inline-flex items-center">
                  <input aria-label={`Selecionar log ${log._id}`} type="checkbox" checked={selectedIds.includes(log._id)} onChange={() => toggleSelect(log._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                </label>
                <div>
                  <p className="font-semibold text-slate-900">{log.action || "Ação"}</p>
                  <p className="text-xs text-slate-500">{log.resourceType || "Resource"} · {log.resourceId || "sem recurso"} · actor {log.actorUserId || "system"}</p>
                  <p className="text-xs text-slate-400">{toDateLabel(log.createdAt)}</p>
                </div>
              </div>
              <details className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 lg:max-w-xl">
                <summary className="cursor-pointer list-none font-semibold text-slate-600">Ver detalhes JSON</summary>
                <JsonBlock data={log.details || {}} />
              </details>
            </div>
          </div>
        ))}

        {tab === "admin-actions" && adminActions.length === 0 && <AdminEmptyState title="Sem admin actions nesta vista" description="Ajuste os filtros ou aguarde novas ações privilegiadas." />}
        {tab === "admin-actions" && adminActions.map((entry) => (
          <div key={entry._id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${selectedIds.includes(entry._id) ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <label className="mt-1 inline-flex items-center">
                  <input aria-label={`Selecionar admin action ${entry._id}`} type="checkbox" checked={selectedIds.includes(entry._id)} onChange={() => toggleSelect(entry._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                </label>
                <div>
                  <p className="font-semibold text-slate-900">{entry.action || "Admin action"}</p>
                  <p className="text-xs text-slate-500">{entry.targetType || "Target"} · {entry.targetId || "sem alvo"} · admin {entry.adminUserId || "system"}</p>
                  <p className="text-xs text-slate-400">{toDateLabel(entry.createdAt)}</p>
                </div>
              </div>
              <details className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 lg:max-w-xl">
                <summary className="cursor-pointer list-none font-semibold text-slate-600">Ver payload JSON</summary>
                <JsonBlock data={entry.payload || {}} />
              </details>
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
          clearSelectionState();
        }}
      />
    </div>
  );
}
