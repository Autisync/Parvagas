"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchAdminMe,
  fetchAnalytics,
  fetchApplications,
  fetchCompanies,
  fetchJobs,
  statusBadgeClass,
  toDateLabel,
  type AdminMe,
  type ApplicationRecord,
  type CompanyRecord,
  type JobRecord,
  type Pagination,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminLoadingLabel,
  AdminPageHeader,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import PaginationControls from "../components/PaginationControls";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import WarningAlert from "@/app/components/errors/WarningAlert";
import { StatCard, AnimatedCounter } from "@/app/components/motion";
import {
  UsersIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  DocumentTextIcon,
  BoltIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

const AdminAnalyticsCharts = dynamic(() => import("../components/AdminAnalyticsCharts"), {
  ssr: false,
  loading: () => <div className="h-64 app-card p-4" />,
});

const DemandSignalsPanel = dynamic(() => import("../components/DemandSignalsPanel"), {
  ssr: false,
});

const AutoApplyAiUsagePanel = dynamic(() => import("../components/AutoApplyAiUsagePanel"), {
  ssr: false,
});

const EmailDeliverabilityPanel = dynamic(() => import("../components/EmailDeliverabilityPanel"), {
  ssr: false,
});

const ClientErrorsPanel = dynamic(() => import("../components/ClientErrorsPanel"), {
  ssr: false,
});

const AnalyticsErrorBoundary = dynamic(() => import("../components/AnalyticsErrorBoundary"), {
  ssr: false,
});

function toInputDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function canPublishJob(status?: string) {
  return ["pending_platform_review", "approved", "archived", "suspended"].includes(String(status || ""));
}

function canRejectJob(status?: string) {
  return String(status || "") === "pending_platform_review";
}

export default function AdminAnalyticsPage() {
  const { token, user } = useAuth("admin");
  const [from, setFrom] = useState(toInputDate(29));
  const [to, setTo] = useState(toInputDate(0));
  const [quickRange, setQuickRange] = useState("30");
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof fetchAnalytics>> | null>(null);
  const [totalsDegraded, setTotalsDegraded] = useState(false);
  const [opsDegraded, setOpsDegraded] = useState(false);

  const [jobSearch, setJobSearch] = useState("");
  const [jobStatus, setJobStatus] = useState("all");
  const [jobSort, setJobSort] = useState("createdAt_desc");
  const [companyStatus, setCompanyStatus] = useState("all");
  const [companySort, setCompanySort] = useState("createdAt_desc");
  const [applicationStatus, setApplicationStatus] = useState("all");
  const [applicationSort, setApplicationSort] = useState("createdAt_desc");
  const [pageJobs, setPageJobs] = useState(1);
  const [pageCompanies, setPageCompanies] = useState(1);
  const [pageApplications, setPageApplications] = useState(1);
  const [jobsLimit, setJobsLimit] = useState(8);
  const [companiesLimit, setCompaniesLimit] = useState(8);
  const [applicationsLimit, setApplicationsLimit] = useState(8);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [jobsPagination, setJobsPagination] = useState<Pagination | undefined>();
  const [companiesPagination, setCompaniesPagination] = useState<Pagination | undefined>();
  const [applicationsPagination, setApplicationsPagination] = useState<Pagination | undefined>();
  const { notify } = useAppNotifier();
  const liveRefreshTimer = useRef<number | null>(null);

  const isSuperAdmin = useMemo(
    () => (me?.adminLevel || user?.adminLevel || "moderator") === "super-admin",
    [me?.adminLevel, user?.adminLevel]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [data, currentAdmin] = await Promise.all([fetchAnalytics(token, from, to), fetchAdminMe(token)]);
      setAnalytics(data);
      setMe(currentAdmin);
      setTotalsDegraded(data.totals?.ok === false);
      setOpsDegraded(data.operational?.ok === false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar analytics."));
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  const loadTables = useCallback(async () => {
    if (!token) return;
    setTableLoading(true);
    setError("");
    try {
      const [jobSortBy, jobSortDir] = jobSort.split("_");
      const [companySortBy, companySortDir] = companySort.split("_");
      const [applicationSortBy, applicationSortDir] = applicationSort.split("_");
      const [jobsRes, companiesRes, applicationsRes] = await Promise.all([
        fetchJobs(token, { page: pageJobs, limit: jobsLimit, status: jobStatus, keyword: jobSearch, sortBy: jobSortBy, sortDir: jobSortDir }),
        fetchCompanies(token, { page: pageCompanies, limit: companiesLimit, status: companyStatus, sortBy: companySortBy, sortDir: companySortDir }),
        fetchApplications(token, { page: pageApplications, limit: applicationsLimit, status: applicationStatus, sortBy: applicationSortBy, sortDir: applicationSortDir }),
      ]);
      setJobs(jobsRes.jobs || []);
      setCompanies(companiesRes.companies || []);
      setApplications(applicationsRes.applications || []);
      setJobsPagination(jobsRes.pagination);
      setCompaniesPagination(companiesRes.pagination);
      setApplicationsPagination(applicationsRes.pagination);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar tabelas operacionais."));
    } finally {
      setTableLoading(false);
    }
  }, [token, pageJobs, pageCompanies, pageApplications, jobsLimit, companiesLimit, applicationsLimit, jobStatus, jobSearch, companyStatus, applicationStatus, jobSort, companySort, applicationSort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    const onLiveUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{ scope?: string }>).detail || {};
      const relevant = new Set(["admin", "jobs", "companies", "applications", "users", "candidates", "global"]);
      if (!relevant.has(String(payload.scope || "global"))) return;

      if (liveRefreshTimer.current) {
        window.clearTimeout(liveRefreshTimer.current);
      }

      liveRefreshTimer.current = window.setTimeout(() => {
        void load();
        void loadTables();
      }, 700);
    };

    window.addEventListener("parvagas:live-update", onLiveUpdate);
    return () => {
      window.removeEventListener("parvagas:live-update", onLiveUpdate);
      if (liveRefreshTimer.current) {
        window.clearTimeout(liveRefreshTimer.current);
      }
    };
  }, [load, loadTables]);

  const setRangeDays = (days: number) => {
    setQuickRange(String(days));
    setFrom(toInputDate(days - 1));
    setTo(toInputDate(0));
  };

  const moderateJob = async (id: string, status: "published" | "platform_rejected") => {
    if (!token) return;
    const reason = window.prompt("Nota de moderação (opcional):") || "";
    const previous = jobs;
    setJobs((current) => current.map((job) => (job._id === id ? { ...job, status } : job)));
    try {
      await authFetch(`/admin/jobs/${id}/moderate`, token, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      notify("Estado da vaga atualizado.", "success");
      await load();
      await loadTables();
    } catch (err: unknown) {
      setJobs(previous);
      setError(getErrorMessage(err, "Erro ao moderar vaga."));
    }
  };

  const verifyCompany = async (id: string, status: "active" | "rejected") => {
    if (!token) return;
    const reason = status === "rejected" ? (window.prompt("Motivo da rejeição:") || "") : "";
    if (status === "rejected" && !reason.trim()) return;
    const previous = companies;
    setCompanies((current) =>
      current.map((company) =>
        company._id === id
          ? { ...company, status, verificationStatus: status === "active" ? "verified" : "rejected" }
          : company
      )
    );
    try {
      await authFetch(`/companies/${id}/verification`, token, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      notify("Estado da empresa atualizado.", "success");
      await load();
      await loadTables();
    } catch (err: unknown) {
      setCompanies(previous);
      setError(getErrorMessage(err, "Erro ao atualizar empresa."));
    }
  };

  const setApplicationStatusInline = async (id: string, status: "under_review" | "rejected" | "shortlisted") => {
    if (!token) return;
    try {
      await authFetch(`/applications/${id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadTables();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao atualizar candidatura."));
    }
  };

  const percentages = useMemo(
    () => ({
      pendingJobs: analytics?.totals?.jobs ? Math.round(((analytics?.operational?.pendingJobs || 0) / analytics.totals.jobs) * 100) : 0,
      pendingCompanies: analytics?.totals?.companies ? Math.round(((analytics?.operational?.pendingCompanies || 0) / analytics.totals.companies) * 100) : 0,
      suspendedUsers: analytics?.totals?.users ? Math.round(((analytics?.operational?.suspendedUsers || 0) / analytics.totals.users) * 100) : 0,
      pendingScraped: analytics?.totals?.scraped ? Math.round(((analytics?.operational?.pendingScraped || 0) / analytics.totals.scraped) * 100) : 0,
    }),
    [analytics]
  );

  return (
    <div>
      <AdminPageHeader
        eyebrow="Analytics"
        title="Centro Analítico Admin"
        description="KPIs, tendências, densidade geográfica e tabelas operacionais para decisões rápidas e auditáveis."
      />

      {error ? <div className="mt-5"><InlineErrorState message={error} onAction={load} /></div> : null}

      {!error && (totalsDegraded || opsDegraded) && (
        <div className="mt-5">
          <WarningAlert
            title="Indicadores temporariamente indisponíveis"
            message="Não foi possível ler alguns contadores agora. Os valores marcados com — serão atualizados assim que a ligação for restabelecida."
            actionLabel="Tentar novamente"
            onAction={load}
          />
        </div>
      )}

      <section className="app-card mt-5 flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Segmented quick-range */}
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Intervalo</span>
            <div className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-sunken)] p-1">
              {[{ d: 7, l: "7 dias" }, { d: 30, l: "30 dias" }, { d: 90, l: "90 dias" }].map((r) => {
                const active = quickRange === String(r.d);
                return (
                  <button
                    key={r.d}
                    onClick={() => setRangeDays(r.d)}
                    aria-pressed={active}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                      active ? "bg-white text-[var(--brand-700)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                    }`}
                  >
                    {r.l}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--text-muted)]">De</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="app-input w-auto" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--text-muted)]">Até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="app-input w-auto" />
          </label>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button onClick={load} disabled={loading} className="app-btn-primary flex-1 px-4 py-2 text-sm sm:flex-none">
            <AdminLoadingLabel loading={loading} idle="Atualizar analytics" busy="A calcular..." />
          </button>
          <button onClick={loadTables} disabled={tableLoading} className="app-btn-secondary flex-1 px-4 py-2 text-sm sm:flex-none">
            <AdminLoadingLabel loading={tableLoading} idle="Atualizar tabelas" busy="A atualizar..." />
          </button>
        </div>
      </section>

      <AnalyticsErrorBoundary
        onRetry={() => {
          void load();
          void loadTables();
        }}
      >

      <section className="mt-6 grid gap-4 pv-stagger sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Utilizadores" value={analytics?.totals?.users ?? 0} unavailable={totalsDegraded || analytics?.totals?.users == null} trendPct={analytics?.trends?.usersPct ?? null} tone="brand" icon={<UsersIcon className="h-5 w-5" />} />
        <StatCard label="Empresas" value={analytics?.totals?.companies ?? 0} unavailable={totalsDegraded || analytics?.totals?.companies == null} trendPct={analytics?.trends?.companiesPct ?? null} tone="info" icon={<BuildingOffice2Icon className="h-5 w-5" />} />
        <StatCard label="Vagas" value={analytics?.totals?.jobs ?? 0} unavailable={totalsDegraded || analytics?.totals?.jobs == null} trendPct={analytics?.trends?.jobsPct ?? null} tone="brand" icon={<BriefcaseIcon className="h-5 w-5" />} />
        <StatCard label="Candidaturas" value={analytics?.totals?.applications ?? 0} unavailable={totalsDegraded || analytics?.totals?.applications == null} trendPct={analytics?.trends?.applicationsPct ?? null} tone="success" icon={<DocumentTextIcon className="h-5 w-5" />} />
        <StatCard label="Ativas" value={analytics?.operational?.activeApplications ?? 0} unavailable={opsDegraded || analytics?.operational?.activeApplications == null} trendPct={null} tone="warning" icon={<BoltIcon className="h-5 w-5" />} />
        {isSuperAdmin ? (
          <StatCard label="Receita" value={analytics?.business?.revenueInRange ?? 0} trendPct={analytics?.trends?.revenuePct ?? null} tone="success" icon={<BanknotesIcon className="h-5 w-5" />} />
        ) : (
          <div className="app-card p-5" title="Receita de campanhas no período. Super-admin apenas.">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text-muted)]">Receita</p>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--success-50)", color: "var(--success-600)" }} aria-hidden>
                <BanknotesIcon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--text-subtle)]">--</p>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">Super-admin apenas</p>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 pv-stagger md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Vagas pendentes", value: analytics?.operational?.pendingJobs ?? 0, ratio: percentages.pendingJobs, tip: "Reveja e publique/rejeite para reduzir backlog." },
          { label: "Empresas pendentes", value: analytics?.operational?.pendingCompanies ?? 0, ratio: percentages.pendingCompanies, tip: "Priorize empresas com documentação completa." },
          { label: "Utilizadores suspensos", value: analytics?.operational?.suspendedUsers ?? 0, ratio: percentages.suspendedUsers, tip: "Monitore reincidência e motivos de suspensão." },
          { label: "Scraped pendente", value: analytics?.operational?.pendingScraped ?? 0, ratio: percentages.pendingScraped, tip: "Curadoria rápida melhora qualidade do feed." },
        ].map((item) => (
          <div key={item.label} className="app-card p-5">
            <p className="text-sm font-medium text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--text-strong)]">
              {opsDegraded ? <span className="text-[var(--text-subtle)]">—</span> : <AnimatedCounter value={item.value} />}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div className="h-full rounded-full bg-[var(--brand-500)]" style={{ width: opsDegraded ? "0%" : `${Math.min(100, Math.max(4, item.ratio))}%` }} />
            </div>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">{opsDegraded ? "—" : `${item.ratio}% no intervalo selecionado`}</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">{item.tip}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <article className="app-card p-4">
          <p className="text-xs font-medium text-slate-500">Anomalias</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Sinais fora do padrão</h3>
          <div className="mt-3 grid gap-2">
            {(analytics?.insights?.anomalies || []).length ? (
              (analytics?.insights?.anomalies || []).map((item, idx) => (
                <div key={`${item.metric}-${idx}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-semibold">
                    {item.metric} {item.direction === "up" ? "subiu" : "caiu"} {Math.abs(item.changePct)}% vs baseline ({item.baseline})
                  </p>
                  <p className="mt-0.5 opacity-80">Último valor: {item.latest}. Priorize investigação se persistir por mais de 2 períodos.</p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Sem anomalias relevantes no período selecionado.</p>
            )}
          </div>
        </article>

        <article className="app-card p-4">
          <p className="text-xs font-medium text-slate-500">Previsões leves</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Próximo período (estimado)</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { label: "Vagas", value: analytics?.insights?.forecasts.jobsPostedNext ?? 0 },
              { label: "Inscrições", value: analytics?.insights?.forecasts.userSignupsNext ?? 0 },
              { label: "Candidaturas", value: analytics?.insights?.forecasts.applicationsNext ?? 0 },
              { label: "Receita", value: analytics?.insights?.forecasts.revenueNext ?? "--" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6">
        <AdminAnalyticsCharts
          jobsPosted={analytics?.series?.jobsPosted || []}
          userSignups={analytics?.series?.userSignups || []}
          applications={analytics?.series?.applications || []}
          revenue={analytics?.series?.revenue || []}
          applicationStatus={analytics?.distributions?.applicationStatus || []}
          jobsByStatus={analytics?.distributions?.jobsByStatus || []}
          revenueEnabled={isSuperAdmin}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <article className="app-card p-4">
          <p className="text-xs font-medium text-slate-500">Mapa de densidade</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Vagas por localização</h3>
          <div className="mt-3 grid gap-2">
            {(analytics?.distributions?.jobLocationDensity || []).slice(0, 8).map((item) => {
              const max = Math.max(...(analytics?.distributions?.jobLocationDensity || [{ value: 1 }]).map((x) => x.value));
              const width = Math.max(12, Math.round((item.value / Math.max(max, 1)) * 100));
              return (
                <div key={item.label} className="grid grid-cols-[1fr,60px] items-center gap-3">
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-red-500" style={{ width: `${width}%` }} />
                  </div>
                  <div className="text-xs text-slate-600">{item.label} ({item.value})</div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="app-card p-4">
          <p className="text-xs font-medium text-slate-500">Mapa de densidade</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Utilizadores por localização</h3>
          <div className="mt-3 grid gap-2">
            {(analytics?.distributions?.userLocationDensity || []).slice(0, 8).map((item) => {
              const max = Math.max(...(analytics?.distributions?.userLocationDensity || [{ value: 1 }]).map((x) => x.value));
              const width = Math.max(12, Math.round((item.value / Math.max(max, 1)) * 100));
              return (
                <div key={item.label} className="grid grid-cols-[1fr,60px] items-center gap-3">
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-sky-500" style={{ width: `${width}%` }} />
                  </div>
                  <div className="text-xs text-slate-600">{item.label} ({item.value})</div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="mt-6 app-card p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={jobSearch}
            onChange={(e) => {
              setJobSearch(e.target.value);
              setPageJobs(1);
            }}
            className={`${adminFieldClass} w-full`}
            placeholder="Pesquisar vagas"
          />
          <select value={jobStatus} onChange={(e) => { setJobStatus(e.target.value); setPageJobs(1); }} className={adminFieldClass}>
            <option value="all">Todas as vagas</option>
            <option value="pending_platform_review">Vagas pendentes</option>
            <option value="published">Vagas publicadas</option>
            <option value="platform_rejected">Vagas rejeitadas</option>
          </select>
          <select value={jobSort} onChange={(e) => { setJobSort(e.target.value); setPageJobs(1); }} className={adminFieldClass} aria-label="Ordenação de vagas">
            <option value="createdAt_desc">Mais recentes</option>
            <option value="createdAt_asc">Mais antigas</option>
            <option value="title_asc">Título A-Z</option>
            <option value="title_desc">Título Z-A</option>
          </select>
        </div>
        <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-[var(--border-soft)]">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="px-2 py-2">Vaga</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Criada</th>
                <th className="px-2 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job._id} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-slate-700">{job.title || "Vaga"}</td>
                  <td className="px-2 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(job.status || "pending"))}`}>{job.status || "pending"}</span></td>
                  <td className="px-2 py-2 text-slate-500">{toDateLabel(job.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      {canPublishJob(job.status) ? (
                        <button onClick={() => moderateJob(job._id, "published")} className="app-action app-action-approve">Publicar</button>
                      ) : null}
                      {canRejectJob(job.status) ? (
                        <button onClick={() => moderateJob(job._id, "platform_rejected")} className="app-action app-action-reject">Rejeitar</button>
                      ) : null}
                      {!canPublishJob(job.status) && !canRejectJob(job.status) ? (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">Aguarda fluxo interno</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.length && <AdminEmptyState title="Sem vagas" description="Ajuste os filtros para ver resultados." />}
        </div>
        <PaginationControls
          pagination={jobsPagination}
          onPage={setPageJobs}
          pageSize={jobsLimit}
          onPageSizeChange={(next) => {
            setJobsLimit(next);
            setPageJobs(1);
          }}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="app-card p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={companyStatus} onChange={(e) => { setCompanyStatus(e.target.value); setPageCompanies(1); }} className={adminFieldClass}>
              <option value="all">Todas as empresas</option>
              <option value="pending_verification">Empresas pendentes</option>
              <option value="active">Empresas ativas</option>
            </select>
            <select value={companySort} onChange={(e) => { setCompanySort(e.target.value); setPageCompanies(1); }} className={adminFieldClass} aria-label="Ordenação de empresas">
              <option value="createdAt_desc">Mais recentes</option>
              <option value="createdAt_asc">Mais antigas</option>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
            </select>
          </div>
          <div className="mt-4 grid gap-2">
            {companies.map((company) => (
              <div key={company._id} className="rounded-xl border border-[var(--border-soft)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                <p className="font-semibold text-slate-900">{company.name || "Empresa"}</p>
                <p className="text-xs text-slate-500">{company.location || "--"} · {toDateLabel(company.createdAt)}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => verifyCompany(company._id, "active")} className="app-action app-action-approve">Verificar</button>
                  <button onClick={() => verifyCompany(company._id, "rejected")} className="app-action app-action-reject">Rejeitar</button>
                </div>
              </div>
            ))}
            {!companies.length && <AdminEmptyState title="Sem empresas" description="Nenhuma empresa corresponde ao filtro atual." />}
          </div>
          <PaginationControls
            pagination={companiesPagination}
            onPage={setPageCompanies}
            pageSize={companiesLimit}
            onPageSizeChange={(next) => {
              setCompaniesLimit(next);
              setPageCompanies(1);
            }}
          />
        </article>

        <article className="app-card p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={applicationStatus} onChange={(e) => { setApplicationStatus(e.target.value); setPageApplications(1); }} className={adminFieldClass}>
              <option value="all">Candidaturas (todas)</option>
              <option value="submitted">Submetidas</option>
              <option value="under_review">Em análise</option>
              <option value="shortlisted">Shortlist</option>
            </select>
            <select value={applicationSort} onChange={(e) => { setApplicationSort(e.target.value); setPageApplications(1); }} className={adminFieldClass} aria-label="Ordenação de candidaturas">
              <option value="createdAt_desc">Mais recentes</option>
              <option value="createdAt_asc">Mais antigas</option>
              <option value="status_asc">Status A-Z</option>
              <option value="status_desc">Status Z-A</option>
            </select>
          </div>
          <div className="mt-4 grid gap-2">
            {applications.map((application) => (
              <div key={application._id} className="rounded-xl border border-[var(--border-soft)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">#{application._id.slice(0, 8)} · {toDateLabel(application.createdAt)}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(String(application.status || "submitted"))}`}>{application.status || "submitted"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setApplicationStatusInline(application._id, "under_review")} className="app-action app-action-neutral">Em análise</button>
                  <button onClick={() => setApplicationStatusInline(application._id, "shortlisted")} className="app-action app-action-approve">Shortlist</button>
                  <button onClick={() => setApplicationStatusInline(application._id, "rejected")} className="app-action app-action-reject">Rejeitar</button>
                </div>
              </div>
            ))}
            {!applications.length && <AdminEmptyState title="Sem candidaturas" description="Nenhuma candidatura corresponde ao filtro atual." />}
          </div>
          <PaginationControls
            pagination={applicationsPagination}
            onPage={setPageApplications}
            pageSize={applicationsLimit}
            onPageSizeChange={(next) => {
              setApplicationsLimit(next);
              setPageApplications(1);
            }}
          />
        </article>
      </section>
      </AnalyticsErrorBoundary>

      {token ? <DemandSignalsPanel token={token} /> : null}
      {token ? <AutoApplyAiUsagePanel token={token} /> : null}
      {token ? <EmailDeliverabilityPanel token={token} /> : null}
      {token ? <ClientErrorsPanel token={token} /> : null}

      {!isSuperAdmin && (
        <AdminAlert tone="warning">
          Vista de moderador: funcionalidades de auditoria, exportações CSV e suspensão de utilizadores estão ocultas por política de acesso.
        </AdminAlert>
      )}
    </div>
  );
}
