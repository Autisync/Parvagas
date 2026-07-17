"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import {
  fetchUsers, fetchAdminMe, runVerificationBackfill, resendUserVerification, statusBadgeClass, toDateLabel,
  fetchUserSubscription, updateUserSubscription, confirmCompanyPayment, confirmCandidateCvPayment,
  forceLogoutUser,
  type UserRecord, type AdminLevel, type Pagination, type UserSubscriptionSummary,
} from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, adminButtonClass, adminFieldClass, adminSecondaryButtonClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

export default function AdminUsersPage() {
  const { token } = useAuth("admin");
  const [list, setList] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [guestFilter, setGuestFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // level and currentUserId are derived from the server-side /admin/me response so they
  // are always accurate (not relying on possibly-stale localStorage JWT claims).
  const [level, setLevel] = useState<AdminLevel>("moderator");
  const [currentUserId, setCurrentUserId] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [subscription, setSubscription] = useState<UserSubscriptionSummary | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subPlanChoice, setSubPlanChoice] = useState("");
  const [subStatusChoice, setSubStatusChoice] = useState("");
  const [subPeriodEnd, setSubPeriodEnd] = useState("");
  // quickSuspend holds the target user when the row "Suspender" button is pressed
  // so we can prompt for a reason via the modal instead of window.prompt.
  const [quickSuspend, setQuickSuspend] = useState<{ user: UserRecord; suspended: boolean } | null>(null);
  const [quickReason, setQuickReason] = useState("");
  const [forceLogoutBusy, setForceLogoutBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);
  const { notify } = useAppNotifier();

  const resendVerification = async (userRecord: UserRecord) => {
    if (!token) return;
    setResendBusyId(userRecord._id);
    try {
      await resendUserVerification(token, userRecord._id);
      notify(`Email de verificação reenviado para ${userRecord.email || "este utilizador"}.`, "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao reenviar verificação."), "error");
    } finally {
      setResendBusyId(null);
    }
  };

  const backfillVerification = async () => {
    if (!token) return;
    setBackfillBusy(true);
    try {
      const preview = await runVerificationBackfill(token, true);
      if (preview.totalUnverified === 0) {
        notify("Não há contas por verificar.", "success");
        return;
      }
      const confirmed = window.confirm(
        `${preview.totalUnverified} conta(s) por verificar — ${preview.skippedCooldown} aguardam o intervalo mínimo entre envios.\n` +
        `Enviar email de verificação a ${preview.sent} conta(s) agora?`,
      );
      if (!confirmed) return;
      const result = await runVerificationBackfill(token, false);
      notify(`Enviados ${result.sent} email(s) de verificação (${result.skippedCooldown} aguardam intervalo).`, "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao enviar emails de verificação."), "error");
    } finally {
      setBackfillBusy(false);
    }
  };

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
      const [usersRes, me] = await Promise.all([
        fetchUsers(token, { page, limit, keyword: search, role, isGuestAccount: guestFilter === "all" ? undefined : guestFilter }),
        fetchAdminMe(token),
      ]);
      setList(usersRes.users || []);
      setPagination(usersRes.pagination);
      setLevel(me.adminLevel);
      setCurrentUserId(me.id || "");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar utilizadores."));
    }
  }, [token, page, limit, search, role, guestFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const managesSubscription = selectedUser?.role === "company" || selectedUser?.role === "candidate";

  useEffect(() => {
    if (!token || !selectedUser || !managesSubscription) {
      setSubscription(null);
      return;
    }
    setSubLoading(true);
    fetchUserSubscription(token, selectedUser._id)
      .then((res) => {
        setSubscription(res);
        setSubPlanChoice(res.subscription?.planCode || "");
        setSubStatusChoice(res.subscription?.status || "");
        setSubPeriodEnd(res.subscription?.currentPeriodEnd ? res.subscription.currentPeriodEnd.slice(0, 10) : "");
      })
      .catch((err: unknown) => notify(getErrorMessage(err, "Erro ao carregar subscrição."), "error"))
      .finally(() => setSubLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedUser?._id, managesSubscription]);

  const saveSubscription = async () => {
    if (!token || !selectedUser || !subscription) return;
    setSubBusy(true);
    try {
      const payload: { planCode?: string; tier?: string; status?: string; currentPeriodEnd?: string } = {};
      if (subscription.scope === "company" && subPlanChoice) payload.planCode = subPlanChoice;
      if (subscription.scope === "candidate" && subPlanChoice) payload.tier = subPlanChoice;
      if (subStatusChoice) payload.status = subStatusChoice;
      if (subPeriodEnd) payload.currentPeriodEnd = subPeriodEnd;
      const updated = await updateUserSubscription(token, selectedUser._id, payload);
      setSubscription(updated);
      notify("Subscrição atualizada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar subscrição."), "error");
    } finally {
      setSubBusy(false);
    }
  };

  const confirmTxPayment = async (reference: string, partyType: string) => {
    if (!token) return;
    setSubBusy(true);
    try {
      if (partyType === "company") await confirmCompanyPayment(token, reference);
      else if (partyType === "candidate") await confirmCandidateCvPayment(token, reference);
      notify("Pagamento confirmado.", "success");
      if (selectedUser) {
        const refreshed = await fetchUserSubscription(token, selectedUser._id);
        setSubscription(refreshed);
      }
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao confirmar pagamento."), "error");
    } finally {
      setSubBusy(false);
    }
  };

  const clearSelectionState = () => {
    clearSelection();
    setBulkReason("");
    setModalReason("");
  };

  const applySuspension = async (ids: string[], suspended: boolean, reason: string) => {
    if (!token || level !== "super-admin" || ids.length === 0) return false;
    if (suspended && ids.includes(currentUserId)) {
      notify("Não pode suspender a sua própria conta.", "error");
      return false;
    }
    if (!reason.trim()) {
      notify(
        suspended ? "Indique o motivo da suspensão antes de continuar." : "Indique o motivo da reativação antes de continuar.",
        "error"
      );
      return false;
    }
    setBusy(ids[0]);
    setError("");
    setNotice("");
    try {
      const responses = await Promise.all(
        ids.map((id) =>
          authFetch<{ user: UserRecord }>(`/admin/users/${id}/suspend`, token, {
            method: "PATCH",
            body: JSON.stringify({ suspended, reason: reason.trim() }),
          })
        )
      );
      const updatedUsers = responses
        .map((entry) => entry.user)
        .filter((entry): entry is UserRecord => Boolean(entry?._id));

      if (updatedUsers.length > 0) {
        const updatedById = new Map(updatedUsers.map((entry) => [entry._id, entry]));
        setList((current) => current.map((entry) => updatedById.get(entry._id) || entry));
        setSelectedUser((current) => (current ? updatedById.get(current._id) || current : current));
      }

      setNotice(
        ids.length > 1
          ? `${ids.length} utilizadores ${suspended ? "suspensos" : "reativados"} com sucesso.`
          : suspended
          ? "Utilizador suspenso com sucesso."
          : "Utilizador reativado com sucesso."
      );
      clearSelectionState();
      setSelectedUser(null);
      await load();
      return true;
    } catch (err: unknown) {
      notify(
        getErrorMessage(err, suspended ? "Erro ao suspender. Verifique a ligação e tente novamente." : "Erro ao reativar. Verifique a ligação e tente novamente."),
        "error"
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleForceLogout = async (userRecord: UserRecord) => {
    if (!token || level !== "super-admin") return;
    setForceLogoutBusy(true);
    try {
      const { user: updated } = await forceLogoutUser(token, userRecord._id);
      setList((current) => current.map((entry) => (entry._id === updated._id ? updated : entry)));
      setSelectedUser((current) => (current && current._id === updated._id ? updated : current));
      notify("Todas as sessões deste utilizador foram terminadas.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao terminar as sessões deste utilizador."), "error");
    } finally {
      setForceLogoutBusy(false);
    }
  };

  const openQuickSuspend = (userRecord: UserRecord, suspended: boolean) => {
    setQuickSuspend({ user: userRecord, suspended });
    setQuickReason("");
  };

  const submitQuickSuspend = async () => {
    if (!quickSuspend) return;
    const ok = await applySuspension([quickSuspend.user._id], quickSuspend.suspended, quickReason);
    if (ok) {
      setQuickSuspend(null);
      setQuickReason("");
    }
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
      notify(getErrorMessage(err, "Não foi possível selecionar todos os utilizadores filtrados."), "error");
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
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backfillVerification}
              disabled={backfillBusy}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {backfillBusy ? "A verificar..." : "Reenviar verificação a contas pendentes"}
            </button>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Permissões: {level}</span>
          </div>
        }
      />

      {error ? <div className="mt-5"><InlineErrorState message={error} onAction={load} /></div> : null}

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
          <select value={guestFilter} onChange={(e) => { setGuestFilter(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
            <option value="all">Contas convidado e normais</option>
            <option value="true">Apenas contas convidado</option>
            <option value="false">Apenas contas registadas</option>
          </select>
      </AdminFilterBar>

      {list.length > 0 && level === "super-admin" ? (
        <section className="mt-5 app-card p-4">
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
          const isCurrentUser = userRecord._id === currentUserId;
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
                  {userRecord.isGuestAccount ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Convidado</span> : null}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(state)}`}>{state}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${userRecord.emailVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {userRecord.emailVerified ? "Verificado" : "Não verificado"}
                  </span>
                  {!userRecord.emailVerified ? (
                    <button
                      type="button"
                      disabled={resendBusyId === userRecord._id}
                      onClick={() => resendVerification(userRecord)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {resendBusyId === userRecord._id ? "A enviar..." : "Reenviar verificação"}
                    </button>
                  ) : null}
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
                    disabled={busy === userRecord._id || level !== "super-admin" || isCurrentUser}
                    onClick={() => openQuickSuspend(userRecord, !userRecord.suspended)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    {level !== "super-admin" ? "Apenas leitura" : isCurrentUser ? "Conta atual" : userRecord.suspended ? "Reativar" : "Suspender"}
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
              <button disabled={busy === selectedUser._id || Boolean(selectedUser.suspended) || selectedUser._id === currentUserId} onClick={() => applySuspension([selectedUser._id], true, modalReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Suspender</button>
              <button disabled={busy === selectedUser._id || !Boolean(selectedUser.suspended)} onClick={() => applySuspension([selectedUser._id], false, modalReason)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">Reativar</button>
              <button
                type="button"
                disabled={forceLogoutBusy}
                onClick={() => handleForceLogout(selectedUser)}
                title="Invalida imediatamente qualquer sessão já iniciada por este utilizador, mesmo que o token ainda não tenha expirado."
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
              >
                Terminar sessões
              </button>
            </div>
            {selectedUser._id === currentUserId ? <p className="text-xs font-semibold text-amber-700">A sua própria conta não pode ser suspensa a partir deste painel.</p> : null}
          </div>
        ) : undefined}
      >
        {selectedUser ? (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(selectedUser.suspended ? "suspended" : "active")}`}>{selectedUser.suspended ? "suspended" : "active"}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${selectedUser.emailVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {selectedUser.emailVerified ? "Email verificado" : "Email não verificado"}
              </span>
              {selectedUser.role ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedUser.role}</span> : null}
              {selectedUser.role === "admin" && selectedUser.adminLevel ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedUser.adminLevel}</span> : null}
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Nome:</span> {selectedUser.fullName || "--"}</p>
              <p><span className="font-semibold">Email:</span> {selectedUser.email || "--"}</p>
              <p><span className="font-semibold">Registo:</span> {toDateLabel(selectedUser.createdAt)}</p>
              <p>
                <span className="font-semibold">Verificação:</span>{" "}
                {selectedUser.emailVerified ? `verificado em ${toDateLabel(selectedUser.emailVerifiedAt || undefined)}` : "por verificar"}
              </p>
              {!selectedUser.emailVerified ? (
                <button
                  type="button"
                  disabled={resendBusyId === selectedUser._id}
                  onClick={() => resendVerification(selectedUser)}
                  className={`${adminSecondaryButtonClass} mt-1 w-fit`}
                >
                  {resendBusyId === selectedUser._id ? "A enviar..." : "Reenviar verificação"}
                </button>
              ) : null}
            </div>

            {managesSubscription && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">Subscrição</p>
                {subLoading ? (
                  <p className="mt-2 text-xs text-slate-500">A carregar...</p>
                ) : subscription ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                        {subscription.subscription
                          ? `${subscription.scope === "candidate" ? subscription.subscription.tier : subscription.subscription.planName || subscription.subscription.planCode} · ${subscription.subscription.status}`
                          : "Sem subscrição"}
                      </span>
                      {subscription.subscription?.currentPeriodEnd ? (
                        <span className="text-slate-500">até {toDateLabel(subscription.subscription.currentPeriodEnd)}</span>
                      ) : null}
                    </div>

                    {level === "super-admin" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-slate-700">{subscription.scope === "candidate" ? "Nível" : "Plano"}</span>
                          <select value={subPlanChoice} onChange={(e) => setSubPlanChoice(e.target.value)} className={adminFieldClass}>
                            <option value="">-- manter --</option>
                            {subscription.availablePlans.map((p) => (
                              <option key={"tier" in p ? p.tier : p.code} value={"tier" in p ? p.tier : p.code}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-slate-700">Estado</span>
                          <select value={subStatusChoice} onChange={(e) => setSubStatusChoice(e.target.value)} className={adminFieldClass}>
                            <option value="">-- manter --</option>
                            <option value="pending">pending</option>
                            <option value="active">active</option>
                            <option value="expired">expired</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </label>
                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-slate-700">Válido até</span>
                          <input type="date" value={subPeriodEnd} onChange={(e) => setSubPeriodEnd(e.target.value)} className={adminFieldClass} />
                        </label>
                      </div>
                    )}
                    {level === "super-admin" && (
                      <button type="button" onClick={saveSubscription} disabled={subBusy} className={`${adminButtonClass} mt-3`}>
                        {subBusy ? "A guardar..." : "Guardar subscrição"}
                      </button>
                    )}

                    {subscription.transactions.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transações</p>
                        <div className="mt-2 space-y-2">
                          {subscription.transactions.map((tx) => (
                            <div key={tx._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                              <span>{tx.reference} · {tx.amount.toLocaleString("pt-PT")} {tx.currency} · {tx.status}</span>
                              {level === "super-admin" && tx.status === "pending" && (
                                <button type="button" onClick={() => confirmTxPayment(tx.reference || "", tx.partyType)} disabled={subBusy} className={adminSecondaryButtonClass}>
                                  Confirmar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Sem dados de subscrição.</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        open={Boolean(quickSuspend)}
        title={quickSuspend?.suspended ? "Suspender utilizador" : "Reativar utilizador"}
        onClose={() => { setQuickSuspend(null); setQuickReason(""); }}
        footer={(
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setQuickSuspend(null); setQuickReason(""); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !quickReason.trim()}
              onClick={submitQuickSuspend}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                quickSuspend?.suspended
                  ? "border-red-700 bg-red-600 text-white hover:bg-red-700"
                  : "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100`}
            >
              {busy ? "A processar..." : quickSuspend?.suspended ? "Eliminar" : "Confirmar reativação"}
            </button>
          </div>
        )}
      >
        {quickSuspend && (
          <div className="grid gap-3">
            <p className="text-sm text-slate-700">
              {quickSuspend.suspended
                ? `Tem a certeza que pretende suspender ${quickSuspend.user.fullName || quickSuspend.user.email || "este utilizador"}?`
                : `Tem a certeza que pretende reativar ${quickSuspend.user.fullName || quickSuspend.user.email || "este utilizador"}?`}
            </p>
            <label className="grid gap-1 text-sm text-slate-700">
              <span>{quickSuspend.suspended ? "Eliminar" : "Motivo"} <span className={quickSuspend.suspended ? "text-red-600" : "text-rose-600"}>*</span></span>
              <textarea
                value={quickReason}
                onChange={(e) => setQuickReason(e.target.value)}
                rows={3}
                className={`${adminFieldClass} resize-y`}
                placeholder={quickSuspend.suspended ? "Explique o motivo da eliminação" : "Explique o motivo da reativação"}
                autoFocus
              />
            </label>
          </div>
        )}
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
