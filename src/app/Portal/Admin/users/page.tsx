"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import { fetchUsers, fetchAdminMe, statusBadgeClass, toDateLabel, type UserRecord, type AdminLevel, type Pagination } from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";

export default function AdminUsersPage() {
  const { token, user } = useAuth("admin");
  const [list, setList] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [level, setLevel] = useState<AdminLevel>(user?.adminLevel === "moderator" ? "moderator" : "super-admin");
  const [bulkReason, setBulkReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const { notify } = useAppNotifier();

  const {
    selectedIds,
    allVisibleSelected,
    toggleSelect,
    toggleVisible,
    clearSelection,
    replaceSelection,
  } = useBulkSelection(list.map((entry) => entry._id));

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [usersRes, me] = await Promise.all([fetchUsers(token, { page, limit, keyword: search, role }), fetchAdminMe(token)]);
      setList(usersRes.users || []);
      setPagination(usersRes.pagination);
      setLevel(me.adminLevel);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar utilizadores."));
    }
  }, [token, page, limit, search, role]);

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

  const clearSelectionState = () => {
    clearSelection();
    setBulkReason("");
    setModalReason("");
  };

  const applySuspension = async (ids: string[], suspended: boolean, reason: string) => {
    if (!token || level !== "super-admin" || ids.length === 0) return;
    if (!reason.trim()) {
      setError(suspended ? "Indique o motivo da suspensão." : "Indique o motivo da reativação.");
      return;
    }
    setBusy(ids[0]);
    setError("");
    setNotice("");
    try {
      await Promise.all(
        ids.map((id) =>
          authFetch(`/admin/users/${id}/suspend`, token, {
            method: "PATCH",
            body: JSON.stringify({ suspended, reason: reason.trim() }),
          })
        )
      );
      setNotice(ids.length > 1 ? `${ids.length} utilizadores atualizados.` : "Utilizador atualizado com sucesso.");
      clearSelectionState();
      setSelectedUser(null);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Falha ao atualizar utilizador."));
    } finally {
      setBusy(null);
    }
  };

  const toggleSuspend = async (id: string, suspended: boolean) => {
    const reason = window.prompt(suspended ? "Motivo da suspensão:" : "Motivo da reativação:") || "";
    await applySuspension([id], suspended, reason);
  };

  const selectAllAcrossPages = async () => {
    if (!token) return;
    setBusy("all-users");
    setError("");
    try {
      const ids = await collectAllIdsAcrossPages<UserRecord>({
        fetchPage: async (currentPage) => {
          const res = await fetchUsers(token, { page: currentPage, limit: 100, keyword: search, role });
          return { items: res.users || [], totalPages: res.pagination?.totalPages || 1 };
        },
        getId: (entry) => entry._id,
      });

      replaceSelection(ids);
      setNotice(`${ids.length} utilizadores selecionados em todas as páginas.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível selecionar todos os utilizadores filtrados."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Acessos"
        title="Gestão de Utilizadores"
        description="Monitorize perfis, papéis e estado de acesso com uma vista operacional clara."
        action={<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Permissões: {level}</span>}
      />

      <AdminFilterBar>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelectionState(); }}
            placeholder="Pesquisar por nome, email ou papel"
            className={`${adminFieldClass} md:col-span-2`}
          />
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
            <option value="all">Todos os papéis</option>
            <option value="candidate">Candidatos</option>
            <option value="company">Empresas</option>
            <option value="admin">Admins</option>
          </select>
      </AdminFilterBar>

      {list.length > 0 && level === "super-admin" ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleVisible} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
              </button>
              {(pagination?.total || 0) > list.length ? (
                <button type="button" disabled={busy === "all-users"} onClick={selectAllAcrossPages} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                  Selecionar todos os {pagination?.total || 0} resultados
                </button>
              ) : null}
            </div>
            {selectedIds.length > 0 ? <p className="text-sm font-semibold text-slate-700">{selectedIds.length} utilizadores selecionados</p> : null}
          </div>

          {selectedIds.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto] lg:items-end">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Motivo da ação em lote</span>
                <textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Obrigatório para suspender ou reativar" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applySuspension(selectedIds, true, bulkReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Suspender</button>
                <button type="button" onClick={() => applySuspension(selectedIds, false, bulkReason)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Reativar</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-5 grid gap-3">
        {list.length === 0 && <AdminEmptyState title="Sem utilizadores nesta vista" description="Ajuste a pesquisa ou o filtro de papel." />}
        {list.map((userRecord) => {
          const state = userRecord.suspended ? "suspended" : "active";
          const adminInfo = userRecord.role === "admin" ? ` · ${userRecord.adminLevel || "super-admin"}` : "";
          const checked = selectedIds.includes(userRecord._id);
          return (
            <div key={userRecord._id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${checked ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-4">
                  {level === "super-admin" ? (
                    <label className="mt-1 inline-flex items-center">
                      <input aria-label={`Selecionar utilizador ${userRecord.fullName || userRecord.email || userRecord._id}`} type="checkbox" checked={checked} onChange={() => toggleSelect(userRecord._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                    </label>
                  ) : null}
                  <div>
                    <p className="font-semibold text-slate-900">{userRecord.fullName || "Utilizador"}</p>
                    <p className="text-sm text-slate-600">{userRecord.email || "Sem email"}</p>
                    <p className="text-xs text-slate-500">{userRecord.role || "role"}{adminInfo} · criado em {toDateLabel(userRecord.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(state)}`}>{state}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(userRecord);
                      setModalReason("");
                    }}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Ver detalhe
                  </button>
                  <button
                    disabled={busy === userRecord._id || level !== "super-admin"}
                    onClick={() => toggleSuspend(userRecord._id, !userRecord.suspended)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    {level !== "super-admin" ? "Apenas leitura" : userRecord.suspended ? "Reativar" : "Suspender"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AdminModal
        open={Boolean(selectedUser)}
        title={selectedUser?.fullName || "Detalhe do utilizador"}
        onClose={() => {
          setSelectedUser(null);
          setModalReason("");
        }}
        footer={selectedUser && level === "super-admin" ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Motivo da ação</span>
              <textarea value={modalReason} onChange={(e) => setModalReason(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Obrigatório para suspender ou reativar" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === selectedUser._id} onClick={() => applySuspension([selectedUser._id], true, modalReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Suspender</button>
              <button disabled={busy === selectedUser._id} onClick={() => applySuspension([selectedUser._id], false, modalReason)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">Reativar</button>
            </div>
          </div>
        ) : undefined}
      >
        {selectedUser ? (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(selectedUser.suspended ? "suspended" : "active")}`}>{selectedUser.suspended ? "suspended" : "active"}</span>
              {selectedUser.role ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedUser.role}</span> : null}
              {selectedUser.role === "admin" && selectedUser.adminLevel ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedUser.adminLevel}</span> : null}
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Nome:</span> {selectedUser.fullName || "--"}</p>
              <p><span className="font-semibold">Email:</span> {selectedUser.email || "--"}</p>
              <p><span className="font-semibold">Registo:</span> {toDateLabel(selectedUser.createdAt)}</p>
            </div>
          </div>
        ) : null}
      </AdminModal>

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
