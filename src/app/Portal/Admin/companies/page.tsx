"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import { fetchAdminMe, fetchCompanies, statusBadgeClass, toDateLabel, type CompanyRecord, type Pagination, type AdminLevel } from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, AdminSpinner, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";
import FormFieldError from "@/app/components/errors/FormFieldError";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { buildCompanyStatusPayload, updateItemsByIds } from "../utils/optimistic";

type CompanyDecision = "active" | "rejected" | "pending_verification" | "inactive";
type VerificationEmailType = "approval" | "more_info" | "rejected" | "inactive";

type DeletionRequest = {
  _id: string;
  companyId: string;
  reason?: string;
  requestedByAdminLevel?: string;
  createdAt?: string;
  status?: string;
  company?: CompanyRecord;
  requestedBy?: {
    fullName?: string;
    email?: string;
  };
};

type EmailPreview = {
  subject: string;
  body: string;
  toEmail: string;
};

const emailTypeLabels: Record<VerificationEmailType, string> = {
  approval: "Aprovação",
  more_info: "Pedido de informação adicional",
  rejected: "Rejeição",
  inactive: "Inativação",
};

type PendingConfirmation =
  | { mode: "status"; ids: string[]; status: CompanyDecision; reason: string }
  | { mode: "email" };

function getCompanyStatus(company?: CompanyRecord | null) {
  return String(company?.status || company?.verificationStatus || "pending_verification");
}

function canReturnCompanyToPending(company?: CompanyRecord | null) {
  return getCompanyStatus(company) === "rejected";
}

export default function AdminCompaniesPage() {
  const { token } = useAuth("admin");
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("pending_verification");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [level, setLevel] = useState<AdminLevel>("moderator");
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionReviewNote, setDeletionReviewNote] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkReasonError, setBulkReasonError] = useState("");
  const [modalReasonError, setModalReasonError] = useState("");
  const [deletionReasonError, setDeletionReasonError] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailType, setEmailType] = useState<VerificationEmailType>("approval");
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirmation | null>(null);
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

      if (me.adminLevel === "super-admin") {
        const deletionRes = await authFetch<{ requests: DeletionRequest[] }>("/companies/deletion-requests", token, {
          suppressGlobalErrors: true,
        });
        setDeletionRequests(deletionRes.requests || []);
      } else {
        setDeletionRequests([]);
      }
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
    setDeletionReason("");
    setDeletionReasonError("");
  };

  const applyDecision = async (ids: string[], status: CompanyDecision, reason: string) => {
    if (!token || ids.length === 0) return;

    if (["rejected", "inactive"].includes(status) && !reason.trim()) {
      if (ids.length > 1) {
        setBulkReasonError("Este estado exige um motivo antes de continuar.");
      } else {
        setModalReasonError("Este estado exige um motivo antes de continuar.");
      }
      return;
    }

    setBulkReasonError("");
    setModalReasonError("");
    setConfirming({ mode: "status", ids, status, reason: reason.trim() });
  };

  const confirmApplyDecision = async () => {
    if (!token || !confirming || confirming.mode !== "status") return;
    const { ids, status, reason } = confirming;
    const previousCompanies = companies;
    const previousSelected = selectedCompany;

    setCompanies((current) =>
      updateItemsByIds(current, ids, (company) => ({
        ...company,
        status,
        verificationStatus: status === "active" ? "verified" : status,
      }))
    );
    if (selectedCompany && ids.includes(selectedCompany._id)) {
      setSelectedCompany({
        ...selectedCompany,
        status,
        verificationStatus: status === "active" ? "verified" : status,
      });
    }

    setBusy(ids[0]);
    setError("");
    setNotice("");

    try {
      const payload = buildCompanyStatusPayload(status, reason);
      await Promise.all(
        ids.map((id) =>
          authFetch(`/companies/${id}/verification`, token, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        )
      );
      setNotice(ids.length > 1 ? `${ids.length} empresas atualizadas.` : "Empresa atualizada com sucesso.");
      clearSelectionState();
      setSelectedCompany(null);
      await load();
    } catch (err: unknown) {
      setCompanies(previousCompanies);
      setSelectedCompany(previousSelected);
      notify(getErrorMessage(err, "Erro ao atualizar empresa."), "error");
    } finally {
      setBusy(null);
      setConfirming(null);
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
      notify(getErrorMessage(err, "Não foi possível selecionar todas as empresas filtradas."), "error");
    } finally {
      setBusy(null);
    }
  };

  const openEmailComposer = async (company: CompanyRecord, type: VerificationEmailType) => {
    if (!token) return;
    setEmailModalOpen(true);
    setEmailType(type);
    setEmailPreview(null);
    setEmailLoading(true);
    setError("");
    try {
      const preview = await authFetch<{ preview: EmailPreview }>(`/companies/${company._id}/verification/preview-email`, token, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setEmailPreview(preview.preview || null);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível pré-visualizar o email."), "error");
    } finally {
      setEmailLoading(false);
    }
  };

  const sendVerificationEmail = async () => {
    if (!token || !selectedCompany || !emailPreview) return;
    setEmailSending(true);
    setError("");
    try {
      await authFetch(`/companies/${selectedCompany._id}/verification/send-email`, token, {
        method: "POST",
        body: JSON.stringify({
          type: emailType,
          subject: emailPreview.subject,
          body: emailPreview.body,
        }),
      });
      setNotice("Email de verificação enviado com sucesso.");
      setEmailModalOpen(false);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível enviar o email."), "error");
    } finally {
      setEmailSending(false);
    }
  };

  const submitDeletionRequest = async () => {
    if (!token || !selectedCompany) return;
    if (!deletionReason.trim()) {
      setDeletionReasonError("Indique o motivo para solicitar exclusão.");
      return;
    }

    setDeletionReasonError("");
    setBusy(selectedCompany._id);
    setError("");
    try {
      const response = await authFetch<{ mode?: string }>(`/companies/${selectedCompany._id}/deletion-request`, token, {
        method: "POST",
        body: JSON.stringify({ reason: deletionReason.trim() }),
      });
      setNotice(
        response.mode === "direct"
          ? "Empresa marcada como rejeitada por exclusão direta."
          : "Pedido de exclusão enviado para aprovação de super-admin."
      );
      setSelectedCompany(null);
      clearSelectionState();
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível criar pedido de exclusão."), "error");
    } finally {
      setBusy(null);
    }
  };

  const reviewDeletionRequest = async (requestId: string, decision: "approve" | "reject") => {
    if (!token) return;
    setBusy(requestId);
    setError("");
    try {
      await authFetch(`/companies/deletion-requests/${requestId}/review`, token, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewNote: deletionReviewNote.trim() }),
      });
      setDeletionReviewNote("");
      setNotice(decision === "approve" ? "Pedido de exclusão aprovado." : "Pedido de exclusão rejeitado.");
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Falha ao rever pedido de exclusão."), "error");
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

      {error ? <div className="mt-5"><InlineErrorState message={error} onAction={load} /></div> : null}

      <AdminFilterBar>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Pesquisar empresas" className={`${adminFieldClass} md:col-span-2`} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
          <option value="pending_verification">Pendentes</option>
          <option value="active">Ativas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="inactive">Inativas</option>
          <option value="all">Todas</option>
        </select>
      </AdminFilterBar>

      {level === "super-admin" ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Fila de pedidos de exclusão</p>
              <p className="text-xs text-slate-500">Moderadores podem solicitar; apenas super-admin pode aprovar ou rejeitar.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {deletionRequests.length} pendente(s)
            </span>
          </div>

          {deletionRequests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Sem pedidos pendentes.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {deletionRequests.map((request) => (
                <article key={request._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{request.company?.name || "Empresa sem nome"}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Solicitado por {request.requestedBy?.fullName || request.requestedBy?.email || "admin"} ({request.requestedByAdminLevel || "moderator"})
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{toDateLabel(request.createdAt)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(request.status || "pending_admin_approval")}`}>
                      {request.status || "pending_admin_approval"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{request.reason || "Sem motivo informado."}</p>
                  <textarea
                    value={deletionReviewNote}
                    onChange={(event) => setDeletionReviewNote(event.target.value)}
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Nota da revisão (opcional)"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === request._id}
                      onClick={() => reviewDeletionRequest(request._id, "approve")}
                      className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Aprovar exclusão
                    </button>
                    <button
                      type="button"
                      disabled={busy === request._id}
                      onClick={() => reviewDeletionRequest(request._id, "reject")}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                    >
                      Rejeitar pedido
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

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
                <textarea value={bulkReason} onChange={(e) => { setBulkReason(e.target.value); if (bulkReasonError) setBulkReasonError(""); }} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Necessário para rejeitar ou inativar" />
                <FormFieldError id="bulk-reason-error" message={bulkReasonError} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyDecision(selectedIds, "active", bulkReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Ativar</button>
                <button type="button" onClick={() => applyDecision(selectedIds, "rejected", bulkReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Rejeitar</button>
                <button type="button" onClick={() => applyDecision(selectedIds, "inactive", bulkReason)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Inativar</button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      <div className="mt-5 grid gap-3">
        {companies.length === 0 && <AdminEmptyState title="Sem empresas nesta vista" description="Ajuste os filtros ou aguarde novos registos de empresa." />}
        {companies.map((company) => {
          const status = getCompanyStatus(company);
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
                    <p className="mt-2 text-xs text-slate-500">Registada em {toDateLabel(company.createdAt)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompany(company);
                    setModalReason("");
                    setDeletionReason("");
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
          setDeletionReason("");
          setDeletionReasonError("");
        }}
        footer={selectedCompany ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Motivo da decisão</span>
              <textarea value={modalReason} onChange={(e) => { setModalReason(e.target.value); if (modalReasonError) setModalReasonError(""); }} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Obrigatório para rejeitar ou inativar" />
              <FormFieldError id="modal-reason-error" message={modalReasonError} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "active", modalReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Ativar</button>
              {canReturnCompanyToPending(selectedCompany) ? (
                <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "pending_verification", modalReason)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Marcar pendente</button>
              ) : null}
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "rejected", modalReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Rejeitar</button>
              <button disabled={busy === selectedCompany._id} onClick={() => applyDecision([selectedCompany._id], "inactive", modalReason)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Inativar</button>
            </div>

            <label className="grid gap-1 text-sm text-slate-700">
              <span>Motivo para solicitação de exclusão</span>
              <textarea value={deletionReason} onChange={(event) => { setDeletionReason(event.target.value); if (deletionReasonError) setDeletionReasonError(""); }} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Obrigatório para solicitar exclusão" />
              <FormFieldError id="deletion-reason-error" message={deletionReasonError} />
            </label>
            <button
              type="button"
              disabled={busy === selectedCompany._id}
              onClick={submitDeletionRequest}
              className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
            >
              {level === "super-admin" ? "Excluir diretamente (rejeitar conta)" : "Solicitar exclusão para aprovação"}
            </button>
          </div>
        ) : undefined}
      >
        {selectedCompany && (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(getCompanyStatus(selectedCompany))}`}>{getCompanyStatus(selectedCompany)}</span>
              {selectedCompany.industry ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedCompany.industry}</span> : null}
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Empresa:</span> {selectedCompany.name || "--"}</p>
              <p><span className="font-semibold">NIF:</span> {selectedCompany.nif || selectedCompany.companyIdentifier || "--"}</p>
              <p><span className="font-semibold">Indústria:</span> {selectedCompany.industry || "--"}</p>
              <p><span className="font-semibold">Dimensão:</span> {selectedCompany.size || "--"}</p>
              <p><span className="font-semibold">Localização:</span> {selectedCompany.location || "--"}</p>
              <p><span className="font-semibold">Contacto:</span> {selectedCompany.contactEmail || "--"}</p>
              <p><span className="font-semibold">Pessoa de contacto:</span> {selectedCompany.contactPerson || "--"}</p>
              <p><span className="font-semibold">Registo:</span> {toDateLabel(selectedCompany.createdAt)}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Mensagens de verificação</p>
              <p className="mt-1 text-xs text-slate-500">Pré-visualize templates e envie email com personalização antes da decisão final.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(emailTypeLabels) as VerificationEmailType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => openEmailComposer(selectedCompany, type)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {emailTypeLabels[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </AdminModal>

      <AdminModal
        open={emailModalOpen}
        title={`Email: ${emailTypeLabels[emailType]}`}
        onClose={() => {
          setEmailModalOpen(false);
          setEmailPreview(null);
        }}
        footer={(
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEmailModalOpen(false)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="button"
              disabled={emailSending || !emailPreview}
              onClick={() => setConfirming({ mode: "email" })}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {emailSending ? "A enviar..." : "Enviar email"}
            </button>
          </div>
        )}
      >
        {emailLoading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-500">
            <AdminSpinner />
            A carregar pré-visualização...
          </p>
        ) : !emailPreview ? (
          <p className="text-sm text-slate-500">Sem pré-visualização disponível.</p>
        ) : (
          <div className="space-y-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Destinatário</span>
              <input value={emailPreview.toEmail} readOnly className={adminFieldClass} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Assunto</span>
              <input
                value={emailPreview.subject}
                onChange={(event) => setEmailPreview((current) => (current ? { ...current, subject: event.target.value } : current))}
                className={adminFieldClass}
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Mensagem</span>
              <textarea
                value={emailPreview.body}
                onChange={(event) => setEmailPreview((current) => (current ? { ...current, body: event.target.value } : current))}
                rows={10}
                className={`${adminFieldClass} resize-y`}
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

      <AdminModal
        open={Boolean(confirming)}
        title="Confirmar ação"
        onClose={() => setConfirming(null)}
        footer={(
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (confirming?.mode === "status") {
                  await confirmApplyDecision();
                  return;
                }
                await sendVerificationEmail();
                setConfirming(null);
              }}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Confirmar
            </button>
          </div>
        )}
      >
        <p className="text-sm text-slate-700">
          {confirming?.mode === "status"
            ? "Tem a certeza de que pretende alterar o estado desta empresa?"
            : "Tem a certeza de que pretende enviar este email de verificação?"}
        </p>
      </AdminModal>
    </div>
  );
}
