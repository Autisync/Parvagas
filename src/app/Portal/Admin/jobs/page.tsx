"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import {
  AdminPermissions,
  fetchAdminMe,
  fetchJobs,
  hasPermission,
  setJobFeatured,
  statusBadgeClass,
  toDateLabel,
  type AdminMe,
  type JobRecord,
  type Pagination,
} from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

type JobDecision = "published" | "approved" | "platform_rejected" | "archived";

function canApplyJobDecision(status: string | undefined, decision: JobDecision) {
  const current = String(status || "");

  if (current === "pending_company_approval") {
    return decision === "archived";
  }

  if (decision === "approved" || decision === "platform_rejected") {
    return current === "pending_platform_review";
  }

  if (decision === "published") {
    return ["pending_platform_review", "approved", "archived", "suspended"].includes(current);
  }

  if (decision === "archived") {
    return [
      "pending_company_approval",
      "company_rejected",
      "pending_platform_review",
      "platform_rejected",
      "approved",
      "published",
      "suspended",
    ].includes(current);
  }

  return false;
}

export default function AdminJobsPage() {
  const { token } = useAuth("admin");
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("pending_platform_review");
  const [visibility, setVisibility] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [featuredBusy, setFeaturedBusy] = useState(false);
  const { notify } = useAppNotifier();

  const {
    selectedIds,
    allVisibleSelected,
    toggleSelect,
    toggleVisible,
    clearSelection,
    replaceSelection,
  } = useBulkSelection(jobs.map((entry) => entry._id));

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [res, admin] = await Promise.all([
        fetchJobs(token, { page, limit, keyword: search, status: filter, visibility }),
        fetchAdminMe(token),
      ]);
      setJobs(res.jobs || []);
      setPagination(res.pagination);
      setMe(admin);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar vagas."));
    }
  }, [token, page, limit, search, filter, visibility]);

  const canReviewJobs = hasPermission(me, AdminPermissions.JOB_REVIEW) || hasPermission(me, AdminPermissions.JOBS_MODERATE);
  const canApproveJobs = hasPermission(me, AdminPermissions.JOB_APPROVE);
  const canRejectJobs = hasPermission(me, AdminPermissions.JOB_REJECT);
  const canPublishJobs = hasPermission(me, AdminPermissions.JOBS_MODERATE);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    // Guard: skip auto-refresh while a mutation is in progress to prevent
    // the polling timer from overwriting optimistic state with stale server data.
    const timer = window.setInterval(() => {
      if (!busy) load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [token, load, busy]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const summaryLine = (job: JobRecord) => {
    const companyName = typeof job.companyId === "object" ? job.companyId?.name : "Empresa";
    return `${companyName || "Empresa"} · ${job.location || "Local"} · ${job.category || "Categoria"}`;
  };

  const clearSelectionState = () => {
    clearSelection();
    setBulkReason("");
    setModalReason("");
  };

  const applyDecision = async (ids: string[], status: JobDecision, nextVisibility?: string, reason = "") => {
    if (!token || ids.length === 0) return;

    if (status === "approved" && !canApproveJobs) {
      notify("Sem permissão para aprovar vagas.", "error");
      return;
    }
    if (status === "platform_rejected" && !canRejectJobs) {
      notify("Sem permissão para rejeitar vagas.", "error");
      return;
    }
    if (status === "published" && !canPublishJobs) {
      notify("Sem permissão para publicar vagas.", "error");
      return;
    }
    if (status === "archived" && !canReviewJobs) {
      notify("Sem permissão para rever/arquivar vagas.", "error");
      return;
    }

    const invalidSelection = jobs.find((job) => ids.includes(job._id) && !canApplyJobDecision(job.status, status));
    if (invalidSelection) {
      notify("A ação selecionada não é permitida para o estado atual desta vaga.", "error");
      return;
    }
    setBusy(ids.length > 1 ? "bulk-jobs" : ids[0]);
    setError("");
    setNotice("");
    try {
      const responses = await Promise.all(
        ids.map((id) =>
          authFetch<{ job: JobRecord }>(`/admin/jobs/${id}/moderate`, token, {
            method: "PATCH",
            body: JSON.stringify({ status, visibility: nextVisibility, reason: reason.trim() }),
          })
        )
      );
      const updatedJobs = responses
        .map((entry) => entry.job)
        .filter((entry): entry is JobRecord => Boolean(entry?._id));

      if (updatedJobs.length > 0) {
        const updatedById = new Map(updatedJobs.map((entry) => [entry._id, entry]));
        setJobs((current) => current.map((job) => updatedById.get(job._id) || job));
        setSelectedJob((current) => (current ? updatedById.get(current._id) || current : current));
      }
      setNotice(ids.length > 1 ? `${ids.length} vagas atualizadas.` : "Vaga atualizada com sucesso.");
      clearSelectionState();
      setSelectedJob(null);
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro na moderação da vaga."), "error");
    } finally {
      setBusy(null);
    }
  };

  const toggleFeatured = async (job: JobRecord) => {
    if (!token) return;
    setFeaturedBusy(true);
    try {
      const { job: updated } = await setJobFeatured(token, job._id, !job.featured);
      setJobs((current) => current.map((entry) => (entry._id === updated._id ? updated : entry)));
      setSelectedJob((current) => (current && current._id === updated._id ? updated : current));
      notify(updated.featured ? "Vaga destacada." : "Vaga deixou de estar destacada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar destaque da vaga."), "error");
    } finally {
      setFeaturedBusy(false);
    }
  };

  const selectAllAcrossPages = async () => {
    if (!token) return;
    setBusy("all-jobs");
    setError("");
    try {
      const ids = await collectAllIdsAcrossPages<JobRecord>({
        fetchPage: async (currentPage) => {
          const res = await fetchJobs(token, { page: currentPage, limit: 100, keyword: search, status: filter, visibility });
          return { items: res.jobs || [], totalPages: res.pagination?.totalPages || 1 };
        },
        getId: (job) => job._id,
      });

      replaceSelection(ids);
      setNotice(`${ids.length} vagas selecionadas em todas as páginas.`);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível selecionar todas as vagas filtradas."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Moderação"
        title="Moderação de Vagas"
        description="Aprove, rejeite e arquive vagas com rastreabilidade operacional."
      />

      {error ? <div className="mt-5"><InlineErrorState message={error} onAction={load} /></div> : null}

      <AdminFilterBar>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Pesquisar vagas" className={adminFieldClass} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
          <option value="pending_platform_review">Pendentes de plataforma</option>
          <option value="pending_company_approval">Pendentes internos (somente leitura)</option>
          <option value="approved">Aprovadas</option>
          <option value="published">Publicadas</option>
          <option value="platform_rejected">Rejeitadas</option>
          <option value="all">Todas</option>
        </select>
        <select value={visibility} onChange={(e) => { setVisibility(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
          <option value="all">Todas as visibilidades</option>
          <option value="public">Públicas</option>
          <option value="private">Privadas</option>
          <option value="draft">Rascunhos</option>
          <option value="archived">Arquivadas</option>
        </select>
      </AdminFilterBar>

      {jobs.length > 0 && (
        <section className="mt-5 app-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleVisible} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
              </button>
              {(pagination?.total || 0) > jobs.length ? (
                <button type="button" disabled={busy === "all-jobs"} onClick={selectAllAcrossPages} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                  Selecionar todos os {pagination?.total || 0} resultados
                </button>
              ) : null}
            </div>
            {selectedIds.length > 0 ? <p className="text-sm font-semibold text-slate-700">{selectedIds.length} vagas selecionadas</p> : null}
          </div>

          {selectedIds.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto] lg:items-end">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Nota opcional para ação em lote</span>
                <textarea value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Adicionar contexto para a ação selecionada" />
              </label>
              <div className="flex flex-wrap gap-2">
                {canPublishJobs ? <button type="button" onClick={() => applyDecision(selectedIds, "published", "public", bulkReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Publicar</button> : null}
                {canApproveJobs ? <button type="button" onClick={() => applyDecision(selectedIds, "approved", undefined, bulkReason)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Aprovar</button> : null}
                {canRejectJobs ? <button type="button" onClick={() => applyDecision(selectedIds, "platform_rejected", undefined, bulkReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Rejeitar</button> : null}
                {canReviewJobs ? <button type="button" onClick={() => applyDecision(selectedIds, "archived", "archived", bulkReason)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Arquivar</button> : null}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <div className="mt-5 grid gap-3">
        {jobs.length === 0 && <AdminEmptyState title="Sem vagas nesta vista" description="Ajuste os filtros ou aguarde novas submissões." />}
        {jobs.map((job) => {
          const status = String(job.status || "pending");
          const checked = selectedIds.includes(job._id);
          return (
            <article key={job._id} className={`rounded-3xl border bg-white p-5 shadow-sm transition ${checked ? "border-red-300 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <label className="mt-1 inline-flex items-center">
                    <input aria-label={`Selecionar vaga ${job.title || job._id}`} type="checkbox" checked={checked} onChange={() => toggleSelect(job._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                  </label>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-slate-950">{job.title || "Vaga"}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>{status}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{job.visibility || "private"}</span>
                      {job.featured ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Destacada</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{summaryLine(job)}</p>
                    <p className="mt-2 text-xs text-slate-500">Criada em {toDateLabel(job.createdAt)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedJob(job);
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
        open={Boolean(selectedJob)}
        title={selectedJob?.title || "Detalhe da vaga"}
        onClose={() => {
          setSelectedJob(null);
          setModalReason("");
        }}
        footer={selectedJob ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Nota de moderação (opcional)</span>
              <textarea value={modalReason} onChange={(e) => setModalReason(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Adicionar contexto para a decisão" />
            </label>
            <div className="flex flex-wrap gap-2">
              {canPublishJobs && canApplyJobDecision(selectedJob.status, "published") ? <button disabled={busy === selectedJob._id} onClick={() => applyDecision([selectedJob._id], "published", "public", modalReason)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Publicar</button> : null}
              {canApproveJobs && canApplyJobDecision(selectedJob.status, "approved") ? <button disabled={busy === selectedJob._id} onClick={() => applyDecision([selectedJob._id], "approved", undefined, modalReason)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">Aprovar</button> : null}
              {canRejectJobs && canApplyJobDecision(selectedJob.status, "platform_rejected") ? <button disabled={busy === selectedJob._id} onClick={() => applyDecision([selectedJob._id], "platform_rejected", undefined, modalReason)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Rejeitar</button> : null}
              {canReviewJobs ? <button disabled={busy === selectedJob._id} onClick={() => applyDecision([selectedJob._id], "archived", "archived", modalReason)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Arquivar</button> : null}
              {canReviewJobs ? (
                <button
                  type="button"
                  disabled={featuredBusy}
                  onClick={() => toggleFeatured(selectedJob)}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
                >
                  {selectedJob.featured ? "Remover destaque" : "Destacar vaga"}
                </button>
              ) : null}
            </div>
            {selectedJob.status === "pending_company_approval" ? <p className="text-xs font-semibold text-amber-700">Esta vaga ainda depende da aprovação interna da empresa antes da moderação da plataforma.</p> : null}
          </div>
        ) : undefined}
      >
        {selectedJob && (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(selectedJob.status || "pending"))}`}>{selectedJob.status || "pending"}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">{selectedJob.visibility || "private"}</span>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Resumo:</span> {summaryLine(selectedJob)}</p>
              <p><span className="font-semibold">Criada:</span> {toDateLabel(selectedJob.createdAt)}</p>
              {selectedJob.contractType ? <p><span className="font-semibold">Tipo de contrato:</span> {selectedJob.contractType}</p> : null}
              {selectedJob.jobType ? <p><span className="font-semibold">Regime:</span> {selectedJob.jobType}</p> : null}
              {selectedJob.workMode ? <p><span className="font-semibold">Modalidade:</span> {selectedJob.workMode}</p> : null}
              {selectedJob.experienceLevel ? <p><span className="font-semibold">Experiência:</span> {selectedJob.experienceLevel}</p> : null}
              {(selectedJob.salaryRange || selectedJob.salaryMin || selectedJob.salaryMax) ? (
                <p>
                  <span className="font-semibold">Salário:</span>{" "}
                  {selectedJob.salaryRange || `${selectedJob.salaryMin ?? "?"} – ${selectedJob.salaryMax ?? "?"}`}
                </p>
              ) : null}
            </div>

            {selectedJob.description ? (
              <div>
                <p className="font-semibold text-slate-900">Descrição</p>
                <p className="mt-1 whitespace-pre-line text-slate-700">{selectedJob.description}</p>
              </div>
            ) : null}

            {(selectedJob.responsibilities?.length ?? 0) > 0 ? (
              <div>
                <p className="font-semibold text-slate-900">Responsabilidades</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {selectedJob.responsibilities?.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
            ) : null}

            {(selectedJob.requirements?.length ?? 0) > 0 ? (
              <div>
                <p className="font-semibold text-slate-900">Requisitos</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {selectedJob.requirements?.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
            ) : null}

            {(selectedJob.requiredSkills?.length ?? 0) > 0 || (selectedJob.preferredSkills?.length ?? 0) > 0 ? (
              <div>
                <p className="font-semibold text-slate-900">Competências</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedJob.requiredSkills?.map((skill, idx) => (
                    <span key={`req-${idx}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{skill}</span>
                  ))}
                  {selectedJob.preferredSkills?.map((skill, idx) => (
                    <span key={`pref-${idx}`} className="rounded-full border border-dashed border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">{skill}</span>
                  ))}
                </div>
              </div>
            ) : null}
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
