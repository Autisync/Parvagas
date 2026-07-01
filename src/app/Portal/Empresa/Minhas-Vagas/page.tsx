"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyJobs } from "@/hooks/useQueries";
import { useDebounce } from "@/hooks/useDebounce";
import Footer from "@/app/components/Footer";
import Link from "next/link";
import DecisionDashboard from "@/app/Portal/components/DecisionDashboard";
import InsightsToolbar from "@/app/Portal/components/InsightsToolbar";
import StickyPortalHeading from "@/app/Portal/components/StickyPortalHeading";
import { useToasts } from "../components/useToasts";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

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
};
const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
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
  const { pushToast } = useToasts();

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
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />

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

            <DecisionDashboard
              className="mb-6"
              title="Dashboard de decisao"
              subtitle="Acompanhe publicacao, aprovacao e qualidade do funil de vagas."
              badge={`Taxa de aprovacao: ${dashboard.approvalRate}%`}
              metrics={[
                { label: "Total de vagas", value: dashboard.total },
                { label: "Ativas", value: dashboard.active },
                { label: "Pendentes", value: dashboard.pending },
                { label: "Rascunhos", value: dashboard.draft },
              ]}
              reportLines={[
                `Aprovadas: ${dashboard.approved}`,
                `Rejeitadas: ${dashboard.rejected}`,
                `Arquivadas: ${dashboard.archived}`,
              ]}
              actionLines={[
                dashboard.pending > 0 ? `Acompanhe ${dashboard.pending} vagas pendentes com a equipa administrativa.` : "Sem vagas pendentes neste momento.",
                dashboard.draft > 0 ? `Finalize ${dashboard.draft} rascunhos para aumentar cobertura de talento.` : "Todos os rascunhos ja foram convertidos ou removidos.",
                dashboard.rejected > 0 ? "Revise titulos/requisitos de vagas rejeitadas para re-submissao." : "Sem rejeicoes recentes, mantenha o padrao atual.",
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
                <div key={job._id} className="border border-gray-100 rounded-2xl p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg">{job.title}</h2>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusColor[job.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>{statusLabel[job.status ?? ""] ?? job.status}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{[job.location, job.workMode, job.category].filter(Boolean).join(" · ")}</p>
                    {job.createdAt && <p className="text-xs text-gray-500 mt-1">Publicada em {new Date(job.createdAt).toLocaleDateString("pt-AO")}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
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
        </div>

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
