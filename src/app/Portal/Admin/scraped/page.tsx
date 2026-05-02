"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, getErrorMessage } from "@/lib/api";
import { fetchScraped, statusBadgeClass, toDateLabel, type ScrapedRecord, type Pagination } from "../adminClient";
import { AdminEmptyState, AdminFilterBar, AdminModal, AdminPageHeader, adminFieldClass } from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { collectAllIdsAcrossPages } from "../hooks/bulkSelectionFetch";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { useAppNotifier } from "@/app/components/AppNotifier";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [selectedJob, setSelectedJob] = useState<ScrapedRecord | null>(null);
  const [modalNote, setModalNote] = useState("");
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
      const res = await fetchScraped(token, { page, limit, keyword: search, status: filter });
      setJobs(res.scrapedJobs || []);
      setPagination(res.pagination);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar scraped jobs."));
    }
  }, [token, page, limit, search, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

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
    const reviewNote = window.prompt("Nota de revisão (opcional):") || "";
    await applyReview([id], status, publishAsPublicJob, reviewNote);
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
      setError(getErrorMessage(err, "Erro ao rever scraped job."));
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

      <div className="mt-5 grid gap-3">
        {jobs.length === 0 && <AdminEmptyState title="Sem scraped jobs nesta vista" description="Ajuste os filtros ou aguarde a próxima importação." />}
        {jobs.map((job) => {
          const status = String(job.status || "pending");
          const checked = selectedIds.includes(job._id);
          return (
            <div key={job._id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${checked ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-4">
                  <label className="mt-1 inline-flex items-center">
                    <input aria-label={`Selecionar scraped job ${job.title || job._id}`} type="checkbox" checked={checked} onChange={() => toggleSelect(job._id)} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
                  </label>
                  <div>
                    <p className="font-semibold text-slate-900">{job.title || "Vaga importada"}</p>
                    <p className="text-xs text-slate-500">{job.company || "Fonte externa"} · {job.location || "Local"}</p>
                    <p className="text-xs text-slate-400">{toDateLabel(job.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>{status}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJob(job);
                      setModalNote("");
                    }}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Ver detalhe
                  </button>
                </div>
              </div>
              {job.duplicateOf && <p className="mt-2 text-xs text-amber-700">Possível duplicado detetado</p>}
            </div>
          );
        })}
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
