"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyJobs } from "@/hooks/useQueries";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch, authFetchRaw, getErrorMessage } from "@/lib/api";
import Footer from "@/app/components/Footer";
import Link from "next/link";
import StatSummary from "@/app/Portal/components/DecisionDashboard";
import InsightsToolbar from "@/app/Portal/components/InsightsToolbar";
import StickyPortalHeading from "@/app/Portal/components/StickyPortalHeading";
import { useToasts } from "../components/useToasts";

const JobPostingModal = dynamic(() => import("../components/JobPostingModal"), {
  ssr: false,
});

const JobEditModal = dynamic(() => import("../components/JobEditModal"), {
  ssr: false,
});

type Job = {
  _id: string;
  title: string;
  status: string;
  description?: string;
  location?: string;
  workMode?: string;
  contractType?: string;
  salaryRange?: string;
  category?: string;
  requiredSkills?: string[];
  createdAt?: string;
  expiresAt?: string;
  applicationCount?: number;
  views?: number;
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  pending_company_approval: "Aguardando aprovação interna",
  pending_platform_review: "Aguardando revisão da plataforma",
  approved: "Aprovada",
  published: "Publicada",
  company_rejected: "Rejeitada internamente",
  platform_rejected: "Rejeitada pela plataforma",
  rejected: "Rejeitada",
  draft: "Rascunho",
  archived: "Arquivada",
  suspended: "Suspensa",
  expired: "Expirada",
};
const statusColor: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  pending_company_approval: "bg-amber-100 text-amber-700",
  pending_platform_review: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-emerald-100 text-emerald-700",
  company_rejected: "bg-rose-100 text-rose-700",
  platform_rejected: "bg-rose-100 text-rose-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-500",
  archived: "bg-gray-100 text-gray-500",
  suspended: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};
const ITEMS_PER_PAGE = 5;

export default function MinhasVagasPage() {
  const { token, loading } = useAuth("company");
  const [page, setPage] = useState(1);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activePreset, setActivePreset] = useState("overview");
  const [closingJobId, setClosingJobId] = useState<string | null>(null);
  const [exportingJobId, setExportingJobId] = useState<string | null>(null);
  const [renewingJobId, setRenewingJobId] = useState<string | null>(null);
  // Snapshot "now" once per mount rather than calling Date.now() inline
  // during render (React purity rule) — a shelf-life countdown doesn't
  // need to tick live, just be accurate as of page load.
  const [nowMs] = useState<number>(() => Date.now());
  const [duplicatingJobId, setDuplicatingJobId] = useState<string | null>(null);
  const { pushToast } = useToasts();

  const _ACTIVE_STATUSES = ["approved", "published", "active"];

  const duplicateJob = async (job: Job) => {
    if (!token) return;
    setDuplicatingJobId(job._id);
    try {
      await authFetch(`/companies/jobs/${job._id}/duplicate`, token, { method: "POST" });
      pushToast("success", "Vaga duplicada — reveja e submeta para revisão.");
      refetch();
    } catch (err: unknown) {
      pushToast("error", getErrorMessage(err, "Erro ao duplicar a vaga."));
    } finally {
      setDuplicatingJobId(null);
    }
  };

  const closeJob = async (job: Job) => {
    if (!token) return;
    if (!window.confirm(`Fechar "${job.title}"? A vaga deixa de aceitar candidaturas e de contar para o limite do seu plano. Pode publicar uma nova vaga no lugar.`)) {
      return;
    }
    setClosingJobId(job._id);
    try {
      await authFetch(`/companies/jobs/${job._id}`, token, { method: "DELETE" });
      pushToast("success", "Vaga fechada. O lugar no seu plano já está livre.");
      refetch();
    } catch (err: unknown) {
      pushToast("error", getErrorMessage(err, "Erro ao fechar a vaga."));
    } finally {
      setClosingJobId(null);
    }
  };

  const exportApplicants = async (job: Job) => {
    if (!token) return;
    setExportingJobId(job._id);
    try {
      const res = await authFetchRaw(`/companies/jobs/${job._id}/applicants.csv`, token);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `candidaturas-${job.title || "vaga"}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (err: unknown) {
      pushToast("error", getErrorMessage(err, "Erro ao exportar candidaturas."));
    } finally {
      setExportingJobId(null);
    }
  };

  const renewJob = async (job: Job) => {
    if (!token) return;
    setRenewingJobId(job._id);
    try {
      await authFetch(`/companies/jobs/${job._id}/renew`, token, { method: "POST" });
      pushToast("success", "Vaga renovada por mais 45 dias.");
      refetch();
    } catch (err: unknown) {
      pushToast("error", getErrorMessage(err, "Erro ao renovar a vaga."));
    } finally {
      setRenewingJobId(null);
    }
  };

  // Debounce search query
  const debouncedQuery = useDebounce(query, 400);

  // Fetch jobs with TanStack Query
  const { data: jobsData, isLoading, error, refetch } = useCompanyJobs(token, page, 20);
  
  const jobs = useMemo(() => jobsData?.jobs || [], [jobsData]);
  const totalRecords = jobsData?.total || 0;
  const totalPages = jobsData?.totalPages || 1;

  const dashboard = useMemo(() => {
    const total = jobs.length;
    const approved = jobs.filter((item) => item.status === "approved").length;
    const pending = jobs.filter((item) => item.status === "pending").length;
    const draft = jobs.filter((item) => item.status === "draft").length;
    const rejected = jobs.filter((item) => item.status === "rejected").length;
    const archived = jobs.filter((item) => item.status === "archived").length;
    const active = approved + pending;

    return {
      total: totalRecords,
      approved,
      pending,
      draft,
      rejected,
      archived,
      active,
      approvalRate: totalRecords > 0 ? Math.round((approved / totalRecords) * 100) : 0,
    };
  }, [jobs, totalRecords]);

  const filteredJobs = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (!normalized) return true;

      const haystack = [job.title, job.location, job.category, job.workMode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [jobs, debouncedQuery, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter]);

  useEffect(() => {
    if (!error) return;
    pushToast("error", (error as Error).message || "Erro ao carregar vagas.");
  }, [error, pushToast]);

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === "overview") {
      setQuery("");
      setStatusFilter("all");
      return;
    }
    if (presetKey === "pending") {
      setQuery("");
      setStatusFilter("pending");
      return;
    }
    if (presetKey === "approved") {
      setQuery("");
      setStatusFilter("approved");
      return;
    }
    if (presetKey === "draft") {
      setQuery("");
      setStatusFilter("draft");
    }
  };

  if (loading || isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-8 px-6 pb-24 lg:pb-16 max-w-7xl mx-auto">
        <section>
          <StickyPortalHeading
            title="Minhas Vagas"
            subtitle="Publique, revise e acompanhe desempenho de vagas em um unico fluxo."
            meta={`${filteredJobs.length} de ${totalRecords} vaga${totalRecords !== 1 ? "s" : ""}`}
            topClassName="top-4"
            action={(
              <button
                onClick={() => setJobModalOpen(true)}
                className="app-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <span aria-hidden="true">+</span>
                <span>Nova vaga</span>
              </button>
            )}
          />

          <StatSummary
            className="mb-6"
            headline={`Taxa de aprovação: ${dashboard.approvalRate}%`}
            metrics={[
              { label: "Total de vagas", value: dashboard.total },
              { label: "Ativas", value: dashboard.active },
              { label: "Pendentes", value: dashboard.pending },
              { label: "Rascunhos", value: dashboard.draft },
            ]}
            notes={[
              `Aprovadas: ${dashboard.approved}`,
              `Rejeitadas: ${dashboard.rejected}`,
              `Arquivadas: ${dashboard.archived}`,
              ...(jobsData?.quota
                ? [
                    jobsData.quota.maxActiveJobs < 0
                      ? `Vagas ativas: ${jobsData.quota.activeJobs} (plano ilimitado)`
                      : `Vagas ativas: ${jobsData.quota.activeJobs} de ${jobsData.quota.maxActiveJobs} do seu plano`,
                  ]
                : []),
            ]}
          />

          <InsightsToolbar
            query={query}
            onQueryChange={(next) => {
              setQuery(next);
              setActivePreset("custom");
            }}
            placeholder="Pesquisar por titulo, localizacao, categoria ou modo"
            selectedFilter={statusFilter}
            onFilterChange={(next) => {
              setStatusFilter(next);
              setActivePreset("custom");
            }}
            resultLabel={`${filteredJobs.length} resultados`}
            activePreset={activePreset}
            onPresetSelect={applyPreset}
            presets={[
              { key: "overview", label: "Visao geral", description: "Todas as vagas" },
              { key: "pending", label: "Pendentes", description: "Aguardando aprovacao" },
              { key: "approved", label: "Aprovadas", description: "Prontas para captação" },
              { key: "draft", label: "Rascunhos", description: "Vagas para finalizar" },
            ]}
            filters={[
              { key: "all", label: "Todas", count: jobs.length },
              { key: "pending", label: "Pendentes", count: jobs.filter((job) => job.status === "pending").length },
              { key: "approved", label: "Aprovadas", count: jobs.filter((job) => job.status === "approved").length },
              { key: "draft", label: "Rascunhos", count: jobs.filter((job) => job.status === "draft").length },
              { key: "rejected", label: "Rejeitadas", count: jobs.filter((job) => job.status === "rejected").length },
            ]}
          />

          {filteredJobs.length === 0 && !isLoading && <p className="text-gray-500 text-center py-12">Nenhuma vaga encontrada para os filtros atuais.</p>}
          <div className="space-y-3">
            {filteredJobs.map(job => (
              <div key={job._id} className="border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-lg">{job.title}</h2>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusColor[job.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>{statusLabel[job.status ?? ""] ?? job.status}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                      {job.applicationCount ?? 0} candidatura{(job.applicationCount ?? 0) === 1 ? "" : "s"}
                    </span>
                    {(job.views ?? 0) > 0 && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                        {job.views} visualizaç{job.views === 1 ? "ão" : "ões"} · {Math.round(((job.applicationCount ?? 0) / (job.views ?? 1)) * 1000) / 10}% conversão
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{[job.location, job.workMode, job.category].filter(Boolean).join(" · ")}</p>
                  {job.createdAt && <p className="text-xs text-gray-500 mt-1">Publicada em {new Date(job.createdAt).toLocaleDateString("pt-AO")}</p>}
                  {job.status === "expired" && (
                    <p className="text-xs font-semibold text-amber-700 mt-1">Vaga expirada — renove para voltar a receber candidaturas.</p>
                  )}
                  {job.status !== "expired" && job.expiresAt && (() => {
                    const daysLeft = Math.ceil((new Date(job.expiresAt).getTime() - nowMs) / 86400000);
                    if (daysLeft > 7) return null;
                    return (
                      <p className="text-xs font-semibold text-amber-700 mt-1">
                        {daysLeft <= 0 ? "Expira hoje" : `Expira em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <button
                    onClick={() => {
                      setEditingJob(job as Job);
                      setEditModalOpen(true);
                    }}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Editar
                  </button>
                  <Link href={`/Vagas-Disponiveis/${job._id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ver</Link>
                  <button
                    onClick={() => duplicateJob(job as Job)}
                    disabled={duplicatingJobId === job._id}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {duplicatingJobId === job._id ? "A duplicar..." : "Duplicar"}
                  </button>
                  {_ACTIVE_STATUSES.includes(job.status ?? "") && (
                    <button
                      onClick={() => closeJob(job as Job)}
                      disabled={closingJobId === job._id}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {closingJobId === job._id ? "A fechar..." : "Fechar vaga"}
                    </button>
                  )}
                  {(job.status === "expired" || (_ACTIVE_STATUSES.includes(job.status ?? "") && job.expiresAt && (new Date(job.expiresAt).getTime() - nowMs) / 86400000 <= 7)) && (
                    <button
                      onClick={() => renewJob(job as Job)}
                      disabled={renewingJobId === job._id}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {renewingJobId === job._id ? "A renovar..." : "Renovar"}
                    </button>
                  )}
                  {(job.applicationCount ?? 0) > 0 && (
                    <button
                      onClick={() => exportApplicants(job as Job)}
                      disabled={exportingJobId === job._id}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {exportingJobId === job._id ? "A exportar..." : "Exportar CSV"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600">Pagina {page} de {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
              >
                Seguinte
              </button>
            </div>
          )}
        </section>

        {token && (
          <JobPostingModal
            token={token}
            open={jobModalOpen}
            onClose={() => setJobModalOpen(false)}
            onCreated={() => {
              refetch();
              pushToast("success", "Pedido de vaga submetido para revisão.");
            }}
          />
        )}

        {token && (
          <JobEditModal
            token={token}
            open={editModalOpen}
            job={editingJob}
            onClose={() => {
              setEditModalOpen(false);
              setEditingJob(null);
            }}
            onSaved={() => {
              refetch();
              pushToast("success", "Vaga actualizada com sucesso.");
            }}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
