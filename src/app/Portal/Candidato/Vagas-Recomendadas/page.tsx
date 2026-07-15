"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import Link from "next/link";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import LottieBlock from "@/app/components/LottieBlock";

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

type Job = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  category?: string;
  salaryRange?: string;
  requiredSkills?: string[];
  companyId?: { name?: string } | string;
  matchScore?: number;
  matchExplanation?: string;
  job?: Job;
};

export default function VagasRecomendadasPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("all");
  const [activePreset, setActivePreset] = useState("overview");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showApplyCelebration, setShowApplyCelebration] = useState(false);
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (!token) return;
    authFetch<{ jobs: Job[] }>("/candidates/jobs/recommended", token)
      .then(d => setJobs(d.jobs || []))
      .catch(() => setError("Erro ao carregar vagas recomendadas."))
      .finally(() => setFetching(false));
  }, [token]);

  const dashboard = useMemo(() => {
    const total = jobs.length;
    const remoteOrHybrid = jobs.filter((item) => {
      const mode = (item.workMode || "").toLowerCase();
      return mode.includes("remot") || mode.includes("hibr");
    }).length;
    const withSalary = jobs.filter((item) => Boolean(item.salaryRange)).length;
    const withSkills = jobs.filter((item) => (item.requiredSkills || []).length > 0).length;
    const topCategory = jobs.reduce<Record<string, number>>((acc, item) => {
      const key = item.category || "Outras";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topCategoryEntry = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0];

    return {
      total,
      remoteOrHybrid,
      withSalary,
      withSkills,
      topCategoryLabel: topCategoryEntry ? topCategoryEntry[0] : "N/A",
      topCategoryCount: topCategoryEntry ? topCategoryEntry[1] : 0,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const mode = (job.workMode || "").toLowerCase();
      if (viewFilter === "remote" && !(mode.includes("remot") || mode.includes("hibr"))) return false;
      if (viewFilter === "salary" && !job.salaryRange) return false;
      if (viewFilter === "skills" && (!job.requiredSkills || job.requiredSkills.length === 0)) return false;
      if (viewFilter === "remoteSalary" && (!(mode.includes("remot") || mode.includes("hibr")) || !job.salaryRange)) return false;

      if (!normalized) return true;
      const company = job.companyId && typeof job.companyId === "object" ? job.companyId.name || "" : "";
      const haystack = [job.title, company, job.location, job.category, job.workMode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [jobs, query, viewFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, page]);

  useEffect(() => {
    setPage(1);
  }, [query, viewFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("erro") ? "error" : "success");
    setMessage("");
  }, [message, notify]);

  // Safety net: auto-hide the apply celebration even if the animation asset
  // fails to load (onComplete would then never fire).
  useEffect(() => {
    if (!showApplyCelebration) return;
    const timer = setTimeout(() => setShowApplyCelebration(false), 4000);
    return () => clearTimeout(timer);
  }, [showApplyCelebration]);

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === "overview") {
      setQuery("");
      setViewFilter("all");
      return;
    }
    if (presetKey === "remoteSalary") {
      setQuery("");
      setViewFilter("remoteSalary");
      return;
    }
    if (presetKey === "skillsFirst") {
      setQuery("");
      setViewFilter("skills");
      return;
    }
    if (presetKey === "salaryFocus") {
      setQuery("");
      setViewFilter("salary");
    }
  };

  if (loading || fetching) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  const normalizeJob = (input: Job): Job => (input.job && input.job._id ? { ...input.job, matchScore: input.matchScore, matchExplanation: input.matchExplanation } : input);
  const companyName = (job: Job) => job.companyId && typeof job.companyId === "object" ? job.companyId.name ?? "Empresa" : "Empresa";

  const saveJob = async (jobId: string) => {
    setSaving(jobId);
    setMessage("");
    try {
      await authFetch("/candidates/jobs/save", token!, { method: "POST", body: JSON.stringify({ jobId }) });
      setMessage("Vaga guardada.");
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao guardar vaga.");
    } finally {
      setSaving(null);
    }
  };

  const applyToJob = async (jobId: string) => {
    setApplying(jobId);
    setMessage("");
    try {
      await authFetch("/candidates/jobs/apply", token!, { method: "POST", body: JSON.stringify({ jobId, profileSource: "main_profile", useLatestCv: true }) });
      setMessage("Candidatura submetida.");
      setShowApplyCelebration(true);
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao candidatar.");
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="p-6 sm:p-8">
      {showApplyCelebration && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-200 bg-white p-4 shadow-lg" role="status">
          <LottieBlock
            name="success-check"
            size={64}
            caption="Candidatura submetida."
            onComplete={() => setShowApplyCelebration(false)}
          />
        </div>
      )}
      <StickyPortalHeading
        title="Vagas Recomendadas"
        subtitle="Aproveite recomendacoes personalizadas com trocas rapidas de perspectiva."
        meta={`${filteredJobs.length} de ${jobs.length} recomendacoes visiveis`}
        topClassName="top-4"
      />

      {error ? <div className="mb-4"><InlineErrorState /></div> : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Quer que candidaturas a estas áreas sejam feitas automaticamente no futuro?
        </p>
        <Link
          href="/Portal/Candidato/CV-e-Documentos"
          className="shrink-0 rounded-xl border border-red-200 px-4 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-50"
        >
          Definir candidatura automática
        </Link>
      </div>

      <StatSummary
        className="mb-6"
        headline={`Recomendações: ${dashboard.total}`}
        metrics={[
          { label: "Total recomendado", value: dashboard.total },
          { label: "Remoto/Híbrido", value: dashboard.remoteOrHybrid },
          { label: "Com salário", value: dashboard.withSalary },
          { label: "Com skills claras", value: dashboard.withSkills },
        ]}
        notes={[`Categoria dominante: ${dashboard.topCategoryLabel} (${dashboard.topCategoryCount})`]}
      />

        <InsightsToolbar
          query={query}
          onQueryChange={(next) => {
            setQuery(next);
            setActivePreset("custom");
          }}
          placeholder="Pesquisar por vaga, empresa, localizacao ou categoria"
          selectedFilter={viewFilter}
          onFilterChange={(next) => {
            setViewFilter(next);
            setActivePreset("custom");
          }}
          resultLabel={`${filteredJobs.length} resultados`}
          activePreset={activePreset}
          onPresetSelect={applyPreset}
          presets={[
            { key: "overview", label: "Visao geral", description: "Todas as recomendacoes" },
            { key: "remoteSalary", label: "Remoto + com salario", description: "Melhor equilibrio de flexibilidade e transparencia" },
            { key: "skillsFirst", label: "Skills first", description: "Prioriza clareza de requisitos" },
            { key: "salaryFocus", label: "Foco em salario", description: "Comparar remuneracao rapidamente" },
          ]}
          filters={[
            { key: "all", label: "Todas", count: jobs.length },
            { key: "remote", label: "Remoto/Hibrido", count: jobs.filter((job) => {
              const mode = (job.workMode || "").toLowerCase();
              return mode.includes("remot") || mode.includes("hibr");
            }).length },
            { key: "salary", label: "Com salario", count: jobs.filter((job) => Boolean(job.salaryRange)).length },
            { key: "skills", label: "Com skills", count: jobs.filter((job) => (job.requiredSkills || []).length > 0).length },
            { key: "remoteSalary", label: "Remoto + salario", count: jobs.filter((job) => {
              const mode = (job.workMode || "").toLowerCase();
              return (mode.includes("remot") || mode.includes("hibr")) && Boolean(job.salaryRange);
            }).length },
          ]}
        />

        {filteredJobs.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhuma recomendacao encontrada para os filtros atuais. Ajuste pesquisa/filtros ou complete o perfil.</p>
            <Link href="/Portal/Candidato/Meu-Perfil" className="mt-3 inline-block text-red-600 hover:underline text-sm">Completar perfil →</Link>
          </div>
        )}
        <div className="space-y-4">
          {paginatedJobs.map((item) => {
            const job = normalizeJob(item);
            return (
            <article key={job._id} className="border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-lg">{job.title}</h2>
                  <p className="text-sm text-gray-500">{companyName(job)}</p>
                </div>
                {job.workMode && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{job.workMode}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Match: {job.matchScore ?? 0}%</span>
                {job.matchExplanation ? <span className="text-xs text-gray-500">{job.matchExplanation}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.location && <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">📍 {job.location}</span>}
                {job.category && <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">{job.category}</span>}
                {job.salaryRange && <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">💰 {job.salaryRange}</span>}
              </div>
              {job.requiredSkills && job.requiredSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.requiredSkills.slice(0, 4).map(s => <span key={s} className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 text-gray-600">{s}</span>)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/Vagas-Disponiveis/${job._id}`} className="text-sm rounded-full border border-red-600 text-red-700 px-4 py-1.5 hover:bg-red-50 font-medium">Ver detalhes</Link>
                <button onClick={() => saveJob(job._id)} disabled={saving === job._id} className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">{saving === job._id ? "A guardar..." : "Guardar"}</button>
                <button onClick={() => applyToJob(job._id)} disabled={applying === job._id} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{applying === job._id ? "A candidatar..." : "Candidatar"}</button>
              </div>
            </article>
          );})}
        </div>
        {filteredJobs.length > ITEMS_PER_PAGE && (
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
