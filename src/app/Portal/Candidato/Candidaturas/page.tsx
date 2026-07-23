"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useApplications } from "@/hooks/useQueries";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import LottieBlock from "@/app/components/LottieBlock";
import MessageThreadModal from "@/app/components/MessageThreadModal";

const StickyPortalHeading = dynamic(() => import("@/app/Portal/components/StickyPortalHeading"), {
  ssr: false,
});

const StatSummary = dynamic(() => import("@/app/Portal/components/DecisionDashboard"), {
  ssr: false,
  loading: () => <div className="mb-6 h-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

const InsightsToolbar = dynamic(() => import("@/app/Portal/components/InsightsToolbar"), {
  ssr: false,
  loading: () => <div className="mb-4 h-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

const ITEMS_PER_PAGE = 5;

type StatusHistory = { status: string; changedAt: string; note?: string };
type Application = {
  _id: string;
  status: string;
  profileSource?: string;
  jobId?: { title?: string; location?: string; companyId?: { name?: string } } | null;
  statusHistory?: StatusHistory[];
  createdAt?: string;
};

const statusLabel: Record<string, string> = {
  submitted: "Submetida",
  under_review: "Em revisão",
  viewed: "Visualizada",
  shortlisted: "Em consideração",
  interview: "Entrevista",
  offer: "Oferta",
  rejected: "Rejeitada",
  hired: "Contratado/a",
  withdrawn: "Retirada",
};

const statusColor: Record<string, string> = {
  submitted: "bg-red-100 text-red-700",
  under_review: "bg-amber-100 text-amber-700",
  viewed: "bg-sky-100 text-sky-700",
  shortlisted: "bg-purple-100 text-purple-700",
  interview: "bg-indigo-100 text-indigo-700",
  offer: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  hired: "bg-green-100 text-green-700",
  withdrawn: "bg-gray-100 text-gray-500",
};

export default function CandidaturasPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activePreset, setActivePreset] = useState("overview");
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messagesApplicationId, setMessagesApplicationId] = useState<string | null>(null);
  const { notify } = useAppNotifier();

  // Debounce search query to avoid API calls on every keystroke
  const debouncedQuery = useDebounce(query, 400);

  // Fetch applications with TanStack Query
  const { data: applicationsData, isLoading, error, refetch } = useApplications(token, page, 20);
  
  const applications = useMemo(() => applicationsData?.applications || [], [applicationsData]);
  const totalRecords = applicationsData?.total || 0;
  const totalPages = applicationsData?.totalPages || 1;

  const dashboard = useMemo(() => {
    const total = applications.length;
    const active = applications.filter((item) => ["submitted", "under_review", "viewed", "shortlisted", "interview", "offer"].includes(item.status)).length;
    const interviews = applications.filter((item) => item.status === "interview").length;
    const hired = applications.filter((item) => item.status === "hired").length;
    const rejected = applications.filter((item) => item.status === "rejected").length;
    const withdrawn = applications.filter((item) => item.status === "withdrawn").length;

    return {
      total: totalRecords,
      active,
      interviews,
      hired,
      rejected,
      withdrawn,
      successRate: totalRecords > 0 ? Math.round((hired / totalRecords) * 100) : 0,
    };
  }, [applications, totalRecords]);

  const filteredApplications = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    return applications.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalized) return true;

      const job = item.jobId && typeof item.jobId === "object" ? item.jobId : null;
      const title = (job?.title || "").toLowerCase();
      const company = (job?.companyId && typeof job.companyId === "object" ? job.companyId.name : "")?.toLowerCase() || "";
      return title.includes(normalized) || company.includes(normalized);
    });
  }, [applications, debouncedQuery, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("erro") ? "error" : "success");
    setMessage("");
  }, [message, notify]);

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === "overview") {
      setQuery("");
      setStatusFilter("all");
      return;
    }
    if (presetKey === "interviews") {
      setQuery("");
      setStatusFilter("interview");
      return;
    }
    if (presetKey === "active") {
      setQuery("");
      setStatusFilter("submitted");
      return;
    }
    if (presetKey === "hired") {
      setQuery("");
      setStatusFilter("hired");
    }
  };

  if (loading || isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  const withdraw = async (id: string) => {
    setWithdrawing(id);
    try {
      await authFetch(`/applications/${id}/status`, token!, {
        method: "PATCH",
        body: JSON.stringify({ status: "withdrawn" }),
      });
      setMessage("Candidatura retirada com sucesso.");
      setTimeout(() => window.location.reload(), 300);
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao retirar candidatura.");
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="p-6 sm:p-8">
      <StickyPortalHeading
        title="As Minhas Candidaturas"
        subtitle="Monitorize progresso e foque nas candidaturas com maior impacto."
        meta={`${filteredApplications.length} de ${totalRecords} candidatura${totalRecords !== 1 ? "s" : ""}`}
        topClassName="top-4"
      />

      {error ? <div className="mb-4"><InlineErrorState /></div> : null}

      <StatSummary
        className="mb-6"
        headline={`Taxa de sucesso: ${dashboard.successRate}%`}
        metrics={[
          { label: "Total", value: dashboard.total },
          { label: "Ativas", value: dashboard.active },
          { label: "Entrevistas", value: dashboard.interviews },
          { label: "Contratações", value: dashboard.hired },
        ]}
        notes={[
          `Rejeitadas: ${dashboard.rejected}`,
          `Retiradas: ${dashboard.withdrawn}`,
        ]}
      />

        <InsightsToolbar
          query={query}
          onQueryChange={(next) => {
            setQuery(next);
            setActivePreset("custom");
          }}
          placeholder="Pesquisar por vaga ou empresa"
          selectedFilter={statusFilter}
          onFilterChange={(next) => {
            setStatusFilter(next);
            setActivePreset("custom");
          }}
          resultLabel={`${filteredApplications.length} resultados`}
          activePreset={activePreset}
          onPresetSelect={applyPreset}
          presets={[
            { key: "overview", label: "Visao geral", description: "Todas as candidaturas" },
            { key: "interviews", label: "Entrevistas", description: "Processos em entrevista" },
            { key: "active", label: "Acompanhar", description: "Submetidas para acompanhamento" },
            { key: "hired", label: "Contratada", description: "Historico de sucesso" },
          ]}
          filters={[
            { key: "all", label: "Todas", count: applications.length },
            { key: "submitted", label: "Submetidas", count: applications.filter((item) => item.status === "submitted").length },
            { key: "shortlisted", label: "Em analise", count: applications.filter((item) => item.status === "shortlisted").length },
            { key: "interview", label: "Entrevista", count: applications.filter((item) => item.status === "interview").length },
            { key: "hired", label: "Contratada", count: applications.filter((item) => item.status === "hired").length },
          ]}
        />

        {filteredApplications.length === 0 && !isLoading && (
          <div className="py-8">
            <LottieBlock name="empty-state" loop size={140} caption="Nenhuma candidatura encontrada para os filtros atuais." />
          </div>
        )}
        <div className="space-y-4">
          {filteredApplications.map(a => {
            const job = a.jobId && typeof a.jobId === "object" ? a.jobId : null;
            const title = job?.title ?? "Vaga";
            const company = job?.companyId && typeof job.companyId === "object" ? job.companyId.name : "Empresa";
            return (
              <div key={a._id} className="border border-gray-100 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-lg">{title}</h2>
                    <p className="text-sm text-gray-500">{company}</p>
                    {a.profileSource ? <p className="mt-1 text-xs text-gray-500">Perfil usado: {a.profileSource}</p> : null}
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColor[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {statusLabel[a.status] ?? a.status}
                  </span>
                </div>

                {/* Timeline */}
                {a.statusHistory && a.statusHistory.length > 0 && (
                  <div className="mt-4 border-t border-gray-50 pt-3">
                    <p className="text-xs text-gray-500 mb-2">Histórico</p>
                    <div className="flex flex-col gap-1">
                      {a.statusHistory.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                          <span className="font-medium">{statusLabel[h.status] ?? h.status}</span>
                          <span>·</span>
                          <span>{new Date(h.changedAt).toLocaleDateString("pt-AO")}</span>
                          {h.note && <span className="text-gray-500">— {h.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {a.status !== "withdrawn" && a.status !== "hired" && a.status !== "rejected" && (
                    <button
                      onClick={() => withdraw(a._id)}
                      disabled={withdrawing === a._id}
                      className="text-xs text-red-600 hover:underline disabled:opacity-60"
                    >
                      {withdrawing === a._id ? "A retirar…" : "Retirar candidatura"}
                    </button>
                  )}
                  {a.hasCompanyMessage && (
                    <button
                      type="button"
                      onClick={() => setMessagesApplicationId(a._id)}
                      className="relative rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Mensagens
                      {(a.unreadMessageCount ?? 0) > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-bold text-white">
                          {a.unreadMessageCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {messagesApplicationId && (
          <MessageThreadModal
            token={token!}
            applicationId={messagesApplicationId}
            viewerRole="candidate"
            open
            onClose={() => setMessagesApplicationId(null)}
            onRead={() => refetch()}
          />
        )}
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
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
            >
              Seguinte
            </button>
          </div>
        )}
    </div>
  );
}
