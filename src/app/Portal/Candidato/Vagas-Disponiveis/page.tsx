"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePublicJobs } from "@/hooks/useQueries";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import Link from "next/link";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

const StickyPortalHeading = dynamic(() => import("@/app/Portal/components/StickyPortalHeading"), {
  ssr: false,
});

const DecisionDashboard = dynamic(() => import("@/app/Portal/components/DecisionDashboard"), {
  ssr: false,
  loading: () => <div className="mb-6 h-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

const InsightsToolbar = dynamic(() => import("@/app/Portal/components/InsightsToolbar"), {
  ssr: false,
  loading: () => <div className="mb-4 h-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

type Job = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  category?: string;
  salaryRange?: string;
  requiredSkills?: string[];
  companyId?: { name?: string } | string;
};

type GeneratedCvProfile = {
  _id: string;
  label?: string;
  targetField?: string;
};

export default function PortalVagasDisponiveisPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("all");
  const [activePreset, setActivePreset] = useState("overview");
  const [saving, setSaving] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [profileSource, setProfileSource] = useState<"main_profile" | "generated_cv_profile">("main_profile");
  const [generatedProfiles, setGeneratedProfiles] = useState<GeneratedCvProfile[]>([]);
  const [generatedCvProfileId, setGeneratedCvProfileId] = useState("");
  const [useLatestCv, setUseLatestCv] = useState(true);
  const [coverLetter, setCoverLetter] = useState("");
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (!token) return;
    authFetch<{ cvProfiles: GeneratedCvProfile[] }>("/candidates/cv-profiles?page=1&limit=20", token)
      .then((res) => {
        const list = res.cvProfiles || [];
        setGeneratedProfiles(list);
        if (list.length > 0 && !generatedCvProfileId) {
          setGeneratedCvProfileId(list[0]._id);
        }
      })
      .catch(() => {});
  }, [token, generatedCvProfileId]);

  // Debounce search query to avoid API calls on every keystroke
  const debouncedQuery = useDebounce(query, 400);

  // Fetch jobs from API with pagination
  const { data: jobsData, isLoading, error } = usePublicJobs(page, 10, { keyword: debouncedQuery });

  const jobs = jobsData?.jobs || [];
  const total = jobsData?.total || 0;
  const totalPages = jobsData?.totalPages || 1;

  const dashboard = useMemo(() => {
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
      pageJobs: jobs.length,
      total,
      remoteOrHybrid,
      withSalary,
      withSkills,
      topCategoryLabel: topCategoryEntry ? topCategoryEntry[0] : "N/A",
      topCategoryCount: topCategoryEntry ? topCategoryEntry[1] : 0,
    };
  }, [jobs, total]);

  // Apply local filters on top of API results
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const mode = (job.workMode || "").toLowerCase();
      if (viewFilter === "remote" && !(mode.includes("remot") || mode.includes("hibr"))) return false;
      if (viewFilter === "salary" && !job.salaryRange) return false;
      if (viewFilter === "skills" && (!job.requiredSkills || job.requiredSkills.length === 0)) return false;
      if (viewFilter === "remoteSalary" && (!(mode.includes("remot") || mode.includes("hibr")) || !job.salaryRange)) return false;
      return true;
    });
  }, [jobs, viewFilter]);

  // Reset to page 1 when search or viewFilter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, viewFilter]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("erro") ? "error" : "success");
    setMessage("");
  }, [message, notify]);

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
    if (presetKey === "quickApply") {
      setQuery("");
      setViewFilter("salary");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;
  }

  const companyName = (job: Job) => job.companyId && typeof job.companyId === "object" ? job.companyId.name || "Empresa" : "Empresa";

  const saveJob = async (jobId: string) => {
    if (!token) return;
    setSaving(jobId);
    setMessage("");
    try {
      await authFetch("/candidates/jobs/save", token, { method: "POST", body: JSON.stringify({ jobId }) });
      setMessage("Vaga guardada.");
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao guardar vaga.");
    } finally {
      setSaving(null);
    }
  };

  const applyToJob = async (jobId: string) => {
    if (!token) return;
    setApplying(jobId);
    setMessage("");
    try {
      await authFetch("/candidates/jobs/apply", token, {
        method: "POST",
        body: JSON.stringify({
          jobId,
          profileSource,
          generatedCvProfileId: profileSource === "generated_cv_profile" ? generatedCvProfileId : undefined,
          useLatestCv,
          coverLetter,
        }),
      });
      setMessage("Candidatura submetida.");
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao candidatar.");
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="p-6 sm:p-8">
      <StickyPortalHeading
        title="Vagas Disponiveis"
        subtitle="Explore oportunidades publicas e mude para visoes de decisao em um clique."
        meta={`${filteredJobs.length} de ${total} vagas visiveis`}
        topClassName="top-4"
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <DecisionDashboard
        className="mt-6 mb-6"
        title="Dashboard de decisao"
        subtitle="Use estes indicadores para priorizar vagas com maior potencial para si."
        badge={`Em catalogo: ${dashboard.total}`}
        metrics={[
          { label: "Nesta pagina", value: dashboard.pageJobs },
          { label: "Remoto/Hibrido", value: dashboard.remoteOrHybrid },
          { label: "Com salario", value: dashboard.withSalary },
            { label: "Com skills claras", value: dashboard.withSkills },
          ]}
          reportLines={[`Categoria dominante: ${dashboard.topCategoryLabel} (${dashboard.topCategoryCount})`]}
          actionLines={[
            dashboard.withSalary > 0 ? "Priorize vagas com faixa salarial explicita para decisao mais rapida." : "Nenhuma vaga com salario nesta pagina; compare outros sinais de qualidade.",
            dashboard.remoteOrHybrid > 0 ? `Existem ${dashboard.remoteOrHybrid} opcoes remoto/hibrido para maior flexibilidade.` : "Sem opcoes remoto/hibrido nesta pagina.",
            dashboard.withSkills < Math.ceil(Math.max(dashboard.pageJobs, 1) / 2) ? "Leia bem a descricao para validar requisitos tecnicos antes de candidatar." : "A maioria das vagas tem requisitos claros de skills.",
          ]}
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
          resultLabel={`${filteredJobs.length} resultados nesta pagina`}
          activePreset={activePreset}
          onPresetSelect={applyPreset}
          presets={[
            { key: "overview", label: "Visao geral", description: "Todas as vagas da pagina" },
            { key: "remoteSalary", label: "Remoto + com salario", description: "Maior flexibilidade com transparencia" },
            { key: "skillsFirst", label: "Skills first", description: "Vagas com requisitos claros" },
            { key: "quickApply", label: "Aplicacao rapida", description: "Foco em vagas com salario" },
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

        <section className="mt-4 rounded-2xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Configuração da candidatura</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Perfil a usar</span>
              <select
                value={profileSource}
                onChange={(e) => setProfileSource(e.target.value as "main_profile" | "generated_cv_profile")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2"
              >
                <option value="main_profile">Perfil principal</option>
                <option value="generated_cv_profile">Perfil CV gerado</option>
              </select>
            </label>
            {profileSource === "generated_cv_profile" ? (
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Perfil gerado</span>
                <select
                  value={generatedCvProfileId}
                  onChange={(e) => setGeneratedCvProfileId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2"
                >
                  {generatedProfiles.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.label || item.targetField || "Perfil CV"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">Cover letter (opcional)</span>
              <textarea
                rows={3}
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input type="checkbox" checked={useLatestCv} onChange={(e) => setUseLatestCv(e.target.checked)} />
              Usar o CV principal carregado mais recente
            </label>
          </div>
        </section>

        {isLoading && <div className="mt-12 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>}

        {!isLoading && (
          <div className="mt-8 grid gap-4">
            {filteredJobs.length === 0 && <p className="text-gray-500 text-center py-12">Nenhuma vaga encontrada para os filtros atuais.</p>}
            {filteredJobs.map((job) => (
              <article key={job._id} className="rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-lg">{job.title}</h2>
                    <p className="text-sm text-gray-500">{companyName(job)}</p>
                  </div>
                  {job.workMode && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{job.workMode}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.location && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{job.location}</span>}
                  {job.category && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-700">{job.category}</span>}
                  {job.salaryRange && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{job.salaryRange}</span>}
                </div>
                {job.requiredSkills && job.requiredSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.requiredSkills.slice(0, 5).map((skill) => <span key={skill} className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{skill}</span>)}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/Vagas-Disponiveis/${job._id}`} className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Ver detalhes</Link>
                  <button onClick={() => saveJob(job._id)} disabled={saving === job._id} className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">{saving === job._id ? "A guardar..." : "Guardar"}</button>
                  <button onClick={() => applyToJob(job._id)} disabled={applying === job._id} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{applying === job._id ? "A candidatar..." : "Candidatar"}</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Anterior</button>
            <span className="text-sm text-slate-600">Página {page} de {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(p + 1, totalPages))} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Seguinte</button>
          </div>
        )}
    </div>
  );
}
