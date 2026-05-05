"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import { fetchAdminMe, fetchCompanies, statusBadgeClass, toDateLabel, type CompanyRecord, type Pagination, type AdminLevel } from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";
import FormFieldError from "@/app/components/errors/FormFieldError";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

type CompanyDecision = "verified" | "rejected" | "pending" | "needs_more_info" | "suspended";

export default function AdminCompaniesPage() {
  const { token } = useAuth("admin");
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [level, setLevel] = useState<AdminLevel>("moderator");
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkReasonError, setBulkReasonError] = useState("");
  const [modalReasonError, setModalReasonError] = useState("");
  const { notify } = useAppNotifier();

  const {
    selectedIds,
    allVisibleSelected,
    toggleSelect,
    toggleVisible,
    clearSelection,
    replaceSelection,
  } = useBulkSelection(companies.map((entry) => entry._id));

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [res, me] = await Promise.all([
        fetchCompanies(token, { page, limit, keyword: search, status: filter }),
        fetchAdminMe(token),
      ]);
      setCompanies(res.companies || []);
      setPagination(res.pagination);
      setLevel(me.adminLevel);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar empresas."));
    }
  }, [token, page, limit, search, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const clearSelectionState = () => {
    clearSelection();
    setBulkReason("");
    setBulkReasonError("");
    setModalReason("");
    setModalReasonError("");
  };

  const applyDecision = async (ids: string[], status: CompanyDecision, reason: string) => {
    if (!token || ids.length === 0) return;
    if (status === "suspended" && level !== "super-admin") {
      setError("Apenas super-admin pode suspender empresas.");
      return;
    }
    if (["rejected", "needs_more_info", "suspended"].includes(status) && !reason.trim()) {
      if (ids.length > 1) {
        setBulkReasonError("Este estado exige um motivo antes de continuar.");
      } else {
        setModalReasonError("Este estado exige um motivo antes de continuar.");
      }
      return;
    }
    setBulkReasonError("");
    setModalReasonError("");
    setBusy(ids[0]);
    setError("");
    setNotice("");
    try {
      await Promise.all(
        ids.map((id) =>
          authFetch(`/companies/${id}/verification`, token, {
            method: "PATCH",
            body: JSON.stringify({ status, reason: reason.trim() }),
          })
        )
      );
      setNotice(ids.length > 1 ? `${ids.length} empresas atualizadas.` : "Empresa atualizada com sucesso.");
      clearSelectionState();
      setSelectedCompany(null);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao atualizar empresa."));
    } finally {
      setBusy(null);
    }
  };

  const selectAllAcrossPages = async () => {
    if (!token) return;
    setBusy("all-companies");
    setError("");
    try {
      const ids = await collectAllIdsAcrossPages<CompanyRecord>({
        fetchPage: async (currentPage) => {
          const res = await fetchCompanies(token, { page: currentPage, limit: 100, keyword: search, status: filter });
          return { items: res.companies || [], totalPages: res.pagination?.totalPages || 1 };
        },
        getId: (company) => company._id,
      });

      replaceSelection(ids);
      setNotice(`${ids.length} empresas selecionadas em todas as páginas.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível selecionar todas as empresas filtradas."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Compliance"
        title="Verificação de Empresas"
        description="Aplique validação de reputação e conformidade de parceiros empregadores."
      />

      {error ? <div className="mt-5"><InlineErrorState onAction={load} /></div> : null}

      <AdminFilterBar>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Pesquisar empresas" className={`${adminFieldClass} md:col-span-2`} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
          <option value="pending">Pendentes</option>
          <option value="verified">Verificadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="needs_more_info">Mais informação</option>
          <option value="suspended">Suspensas</option>
          <option value="all">Todas</option>
        </select>
      </AdminFilterBar>

      {companies.length > 0 && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleVisible} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
              </button>
              {(pagination?.total || 0) > companies.length ? (
                <button type="button" disabled={busy === "all-companies"} onClick={selectAllAcrossPages} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                  Selecionar todos os {pagination?.total || 0} resultados
                </button>
              ) : null}
            </div>
            {selectedIds.length > 0 ? <p className="text-sm font-semibold text-slate-700">{selectedIds.length} empresas selecionadas</p> : null}
          </div>

          {selectedIds.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto] lg:items-end">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Motivo para ação em lote</span>
                <textarea value={bulkReason} onChange={(e) => { setBulkReason(e.target.value); if (bulkReasonError) setBulkReasonError(""); }} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Necessário para rejeitar, pedir informação ou suspender" />
                <FormFieldError id="bulk-reason-error" message={bulkReasonError} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyDecision(selectedIds, "verified", bulkReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Verificar</button>
                <button type="button" onClick={() => applyDecision(selectedIds, "pending", bulkReason)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Marcar pendente</button>
                <button type="button" onClick={() => applyDecision(selectedIds, "needs_more_info", bulkReason)} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Pedir info</button>
                <button type="button" onClick={() => applyDecision(selectedIds, "rejected", bulkReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Rejeitar</button>
                {level === "super-admin" ? <button type="button" onClick={() => applyDecision(selectedIds, "suspended", bulkReason)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Suspender</button> : null}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <div className="mt-5 grid gap-3">
        {companies.length === 0 && <AdminEmptyState title="Sem empresas nesta vista" description="Ajuste os filtros ou aguarde novos registos de empresa." />}
        {companies.map((company) => {
          const status = String(company.verificationStatus || "pending");
          const checked = selectedIds.includes(company._id);
          return (
            <article key={company._id} className={`rounded-3xl border bg-white p-5 shadow-sm transition ${checked ? "border-red-300 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <label className="mt-1 inline-flex items-center">
                    <input aria-label={`Selecionar empresa ${company.name || company._id}`} type="checkbox" checked={checked} onChange={() => toggleSelect(company._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                  </label>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-slate-950">{company.name || "Empresa"}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>{status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{company.industry || "Setor"} · {company.location || "Local"}</p>
                    <p className="mt-1 text-sm text-slate-500">{company.contactEmail || "Sem email de contacto"}</p>
                    <p className="mt-2 text-xs text-slate-400">Registada em {toDateLabel(company.createdAt)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompany(company);
                    setModalReason("");
                    setError("");
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Ver detalhe
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M7.22 4.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <AdminModal
        open={Boolean(selectedCompany)}
        title={selectedCompany?.name || "Detalhe da empresa"}
        onClose={() => {
          setSelectedCompany(null);
          setModalReason("");
          setModalReasonError("");
        }}
        footer={selectedCompany ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Motivo da decisão</span>
              <textarea value={modalReason} onChange={(e) => { setModalReason(e.target.value); if (modalReasonError) setModalReasonError(""); }} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Obrigatório para rejeitar, pedir informação ou suspender" />
              <FormFieldError id="modal-reason-error" message={modalReasonError} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "verified", modalReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Verificar</button>
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "pending", modalReason)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Marcar pendente</button>
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "needs_more_info", modalReason)} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Pedir info</button>
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "rejected", modalReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Rejeitar</button>
              {level === "super-admin" ? <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "suspended", modalReason)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Suspender</button> : null}
            </div>
          </div>
        ) : undefined}
      >
        {selectedCompany && (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(selectedCompany.verificationStatus || "pending"))}`}>{selectedCompany.verificationStatus || "pending"}</span>
              {selectedCompany.industry ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedCompany.industry}</span> : null}
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Localização:</span> {selectedCompany.location || "--"}</p>
              <p><span className="font-semibold">Contacto:</span> {selectedCompany.contactEmail || "--"}</p>
              <p><span className="font-semibold">Registo:</span> {toDateLabel(selectedCompany.createdAt)}</p>
            </div>
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
