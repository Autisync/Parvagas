"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import {
  fetchScraped,
  updateScrapedJob,
  deleteScrapedJob,
  statusBadgeClass,
  toDateLabel,
  type ScrapedRecord,
  type Pagination,
} from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, AdminSpinner, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

export default function AdminScrapedPage() {
  const { token } = useAuth("admin");
  const [jobs, setJobs] = useState<ScrapedRecord[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [selectedJob, setSelectedJob] = useState<ScrapedRecord | null>(null);
  const [modalNote, setModalNote] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
    setLoading(true);
    setError("");
    try {
      const res = await fetchScraped(token, { page, limit, keyword: search, status: filter });
      setJobs(res.scrapedJobs || []);
      setPagination(res.pagination);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar scraped jobs."));
    } finally {
      setLoading(false);
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
    setBulkNote("");
    setModalNote("");
  };

  const createScraped = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError("");
    setNotice("");
    try {
      await authFetch("/admin/scraped-jobs", token, {
        method: "POST",
        body: JSON.stringify({ title: newTitle, company: newCompany, location: newLocation, sourceUrl: newSourceUrl }),
      });
      setNewTitle("");
      setNewCompany("");
      setNewLocation("");
      setNewSourceUrl("");
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao criar scraped job."));
    }
  };

  const review = async (id: string, status: "approved" | "rejected" | "duplicate" | "archived", publishAsPublicJob = false) => {
    const reviewNote = window.prompt("Nota de revisão (opcional):");
    if (reviewNote === null) return; // user cancelled
    await applyReview([id], status, publishAsPublicJob, reviewNote);
  };

  const saveEdit = async () => {
    if (!token || !selectedJob) return;
    setBusy(selectedJob._id);
    setError("");
    try {
      await updateScrapedJob(token, selectedJob._id, {
        title: editTitle,
        company: editCompany,
        location: editLocation,
        sourceUrl: editSourceUrl,
      });
      setNotice("Scraped job atualizado com sucesso.");
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar scraped job."), "error");
    } finally {
      setBusy(null);
    }
  };

  const removeScraped = async (job: ScrapedRecord) => {
    if (!token) return;
    setBusy(job._id);
    setError("");
    try {
      await deleteScrapedJob(token, job._id);
      setDeleteConfirmId(null);
      setNotice("Scraped job eliminado.");
      if (selectedJob?._id === job._id) setSelectedJob(null);
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao eliminar scraped job."), "error");
    } finally {
      setBusy(null);
    }
  };

  const applyReview = async (ids: string[], status: "approved" | "rejected" | "duplicate" | "archived", publishAsPublicJob = false, reviewNote = "") => {
    if (!token || ids.length === 0) return;
    setBusy(ids[0]);
    setError("");
    setNotice("");
    try {
      await Promise.all(
        ids.map((id) =>
          authFetch(`/admin/scraped-jobs/${id}/review`, token, {
            method: "PATCH",
            body: JSON.stringify({ status, reviewNote, publishAsPublicJob }),
          })
        )
      );
      setNotice(ids.length > 1 ? `${ids.length} scraped jobs atualizados.` : "Scraped job atualizado com sucesso.");
      clearSelectionState();
      setSelectedJob(null);
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao rever scraped job."), "error");
    } finally {
      setBusy(null);
    }
  };

  const selectAllAcrossPages = async () => {
    if (!token) return;
    setBusy("all-scraped");
    setError("");
    try {
      const ids = await collectAllIdsAcrossPages<ScrapedRecord>({
        fetchPage: async (currentPage) => {
          const res = await fetchScraped(token, { page: currentPage, limit: 100, keyword: search, status: filter });
          return { items: res.scrapedJobs || [], totalPages: res.pagination?.totalPages || 1 };
        },
        getId: (job) => job._id,
      });

      replaceSelection(ids);
      setNotice(`${ids.length} scraped jobs selecionados em todas as páginas.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível selecionar todos os scraped jobs filtrados."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Curadoria"
        title="Curadoria de Scraped Jobs"
        description="Controle qualidade de vagas externas e evite duplicados no catálogo."
      />

      {error ? <div className="mt-4"><InlineErrorState message={error} onAction={load} /></div> : null}

      <form onSubmit={createScraped} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título" required className={adminFieldClass} />
          <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Empresa/Fonte" required className={adminFieldClass} />
          <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Local" className={adminFieldClass} />
          <input value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="URL de origem" className={adminFieldClass} />
        </div>
        <button type="submit" className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">Criar scraped job</button>
      </form>

      <AdminFilterBar>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); clearSelectionState(); }} placeholder="Pesquisar scraped jobs" className={`${adminFieldClass} md:col-span-2`} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); clearSelectionState(); }} className={adminFieldClass}>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="all">Todas</option>
        </select>
      </AdminFilterBar>

      {jobs.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleVisible} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                {allVisibleSelected ? "Desmarcar página" : "Selecionar página"}
              </button>
              {(pagination?.total || 0) > jobs.length ? (
                <button type="button" disabled={busy === "all-scraped"} onClick={selectAllAcrossPages} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                  Selecionar todos os {pagination?.total || 0} resultados
                </button>
              ) : null}
            </div>
            {selectedIds.length > 0 ? <p className="text-sm font-semibold text-slate-700">{selectedIds.length} scraped jobs selecionados</p> : null}
          </div>

          {selectedIds.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto] lg:items-end">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Nota de revisão em lote</span>
                <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Adicionar contexto para a revisão selecionada" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyReview(selectedIds, "approved", true, bulkNote)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprovar + publicar</button>
                <button type="button" onClick={() => applyReview(selectedIds, "rejected", false, bulkNote)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Rejeitar</button>
                <button type="button" onClick={() => applyReview(selectedIds, "duplicate", false, bulkNote)} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Marcar duplicado</button>
                <button type="button" onClick={() => applyReview(selectedIds, "archived", false, bulkNote)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Arquivar</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="inline-flex items-center gap-2 p-6 text-sm text-slate-600">
            <AdminSpinner />
            A carregar vagas raspadas...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-6">
            <AdminEmptyState title="Sem vagas raspadas" description="Nenhum anúncio de vaga raspado disponível." />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Título</th>
                <th className="px-3 py-3">Empresa</th>
                <th className="px-3 py-3">Local</th>
                <th className="px-3 py-3">Fonte</th>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job._id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <input aria-label={`Selecionar scraped job ${job.title || job._id}`} type="checkbox" checked={selectedIds.includes(job._id)} onChange={() => toggleSelect(job._id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                      <div>
                        <p className="font-semibold text-slate-900">{job.title || "Vaga importada"}</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(job.status || "pending"))}`}>{job.status || "pending"}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{job.company || "--"}</td>
                  <td className="px-3 py-3 text-slate-700">{job.location || "--"}</td>
                  <td className="px-3 py-3 text-slate-700">{job.source || "Manual"}</td>
                  <td className="px-3 py-3 text-slate-500">{toDateLabel(job.createdAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setSelectedJob(job); setModalNote(""); setEditTitle(job.title || ""); setEditCompany(job.company || ""); setEditLocation(job.location || ""); setEditSourceUrl(job.sourceUrl || ""); }} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Rever</button>
                      <button type="button" onClick={() => review(job._id, "approved", true)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Aprovar</button>
                      <button type="button" onClick={() => review(job._id, "rejected", false)} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">Rejeitar</button>
                      {deleteConfirmId === job._id ? (
                        <span className="inline-flex items-center gap-1">
                          <button type="button" disabled={busy === job._id} onClick={() => removeScraped(job)} className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Confirmar</button>
                          <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">Cancelar</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setDeleteConfirmId(job._id)} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AdminModal
        open={Boolean(selectedJob)}
        title={selectedJob?.title || "Detalhe do scraped job"}
        onClose={() => {
          setSelectedJob(null);
          setModalNote("");
        }}
        footer={selectedJob ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-slate-700">
              <span>Nota de revisão</span>
              <textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} rows={3} className={`${adminFieldClass} resize-y`} placeholder="Opcional" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === selectedJob._id} onClick={() => applyReview([selectedJob._id], "approved", true, modalNote)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Aprovar + publicar</button>
              <button disabled={busy === selectedJob._id} onClick={() => applyReview([selectedJob._id], "rejected", false, modalNote)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Rejeitar</button>
              <button disabled={busy === selectedJob._id} onClick={() => applyReview([selectedJob._id], "duplicate", false, modalNote)} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Marcar duplicado</button>
              <button disabled={busy === selectedJob._id} onClick={() => applyReview([selectedJob._id], "archived", false, modalNote)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Arquivar</button>
            </div>
          </div>
        ) : undefined}
      >
        {selectedJob ? (
          <div className="grid gap-4 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(selectedJob.status || "pending"))}`}>{selectedJob.status || "pending"}</span>
              {selectedJob.duplicateOf ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Possível duplicado</span> : null}
            </div>
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Editar antes de rever</p>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={adminFieldClass} placeholder="Título" />
              <input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} className={adminFieldClass} placeholder="Empresa" />
              <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className={adminFieldClass} placeholder="Localização" />
              <input value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)} className={adminFieldClass} placeholder="URL de origem" />
              <div>
                <button type="button" onClick={saveEdit} disabled={busy === selectedJob._id} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Salvar edição</button>
              </div>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
              <p><span className="font-semibold">Empresa/Fonte:</span> {selectedJob.company || "--"}</p>
              <p><span className="font-semibold">Local:</span> {selectedJob.location || "--"}</p>
              <p><span className="font-semibold">Criado:</span> {toDateLabel(selectedJob.createdAt)}</p>
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
