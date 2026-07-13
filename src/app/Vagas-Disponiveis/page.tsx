"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import SponsoredAdSlot from "@/app/components/SponsoredAdSlot";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { AcademicCapIcon, BanknotesIcon, ClockIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { track } from "@/lib/analytics";

export type Job = {
  _id: string;
  title: string;
  companyId?: { name?: string; industry?: string; logo?: string; verified?: boolean } | string;
  externalCompanyName?: string | null;
  externalCompanyLogo?: string | null;
  location?: string;
  workMode?: string;
  mode?: string;
  category?: string;
  contractType?: string;
  jobType?: string;
  salaryRange?: string;
  requiredSkills?: string[];
  experienceLevel?: string;
  requiredExperienceYears?: number;
  expiresAt?: string;
};

// 18 províncias de Angola (filtro de pesquisa)
const ANGOLA_PROVINCES = [
  "Bengo", "Benguela", "Bié", "Cabinda", "Cuando Cubango", "Cuanza Norte",
  "Cuanza Sul", "Cunene", "Huambo", "Huíla", "Luanda", "Lunda Norte",
  "Lunda Sul", "Malanje", "Moxico", "Namibe", "Uíge", "Zaire",
] as const;

type PaginationMeta = { page: number; limit: number; total: number; totalPages: number; };

const modeColor: Record<string, string> = {
  Remoto: "bg-green-100 text-green-700",
  Híbrido: "bg-blue-100 text-blue-700",
  Hibrido: "bg-blue-100 text-blue-700",
  Presencial: "bg-orange-100 text-orange-700",
  Rotativo: "bg-purple-100 text-purple-700",
};
const categoryColor: Record<string, string> = {
  Tecnologia: "bg-red-50 text-red-700",
  Energia: "bg-yellow-50 text-yellow-700",
  "Saúde": "bg-teal-50 text-teal-700",
  Saude: "bg-teal-50 text-teal-700",
  "Banca e Finanças": "bg-emerald-50 text-emerald-700",
  Logistica: "bg-indigo-50 text-indigo-700",
  "Recursos Humanos": "bg-pink-50 text-pink-700",
  Comercial: "bg-amber-50 text-amber-700",
};

export function companyName(job: Job): string {
  // Aggregated/scraped jobs are owned by a synthetic "Parvagas Aggregator"
  // company record — prefer the real hiring company name when present.
  if (job.externalCompanyName) return job.externalCompanyName;
  if (job.companyId && typeof job.companyId === "object") return job.companyId.name || "Empresa";
  return "Empresa";
}

function companyLogo(job: Job): string | null {
  if (job.externalCompanyLogo) return job.externalCompanyLogo;
  if (job.companyId && typeof job.companyId === "object") return job.companyId.logo || null;
  return null;
}

// Stable module-level default so it never re-creates per render (used as both a
// useState initializer and a useCallback default arg).
const emptyFilters = { keyword: "", location: "", category: "", workMode: "", contractType: "", seniority: "", salaryMin: "", datePosted: "", sort: "recent" };

function VagasDisponiveisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [contractType, setContractType] = useState("");
  const [seniority, setSeniority] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [datePosted, setDatePosted] = useState("");
  const [sort, setSort] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);
  const [applied, setApplied] = useState(emptyFilters);
  const { dict, locale } = useClientLocale();
  const categoryLabels: Record<string, string> =
    locale === "en"
      ? {
          Tecnologia: "Technology",
          Energia: "Energy",
          Saude: "Healthcare",
          "Banca e Financas": "Banking and Finance",
          Logistica: "Logistics",
          "Recursos Humanos": "Human Resources",
          Comercial: "Commercial",
        }
      : {
          Tecnologia: "Tecnologia",
          Energia: "Energia",
          Saude: "Saúde",
          "Banca e Financas": "Banca e Finanças",
          Logistica: "Logística",
          "Recursos Humanos": "Recursos Humanos",
          Comercial: "Comercial",
        };
  const modeLabels: Record<string, string> =
    locale === "en"
      ? {
          Presencial: "On-site",
          Hibrido: "Hybrid",
          Remoto: "Remote",
          Rotativo: "Shift",
        }
      : {
          Presencial: "Presencial",
          Hibrido: "Híbrido",
          Remoto: "Remoto",
          Rotativo: "Rotativo",
        };

  const buildQuery = useCallback((page: number, filters: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (filters.keyword) params.set("keyword", filters.keyword);
    if (filters.location) params.set("provinceCity", filters.location);
    if (filters.category) params.set("category", filters.category);
    if (filters.workMode) params.set("workMode", filters.workMode);
    if (filters.contractType) params.set("contractType", filters.contractType);
    if (filters.seniority) params.set("seniority", filters.seniority);
    if (filters.salaryMin) params.set("salaryMin", filters.salaryMin);
    if (filters.datePosted) params.set("datePostedDays", filters.datePosted);
    if (filters.sort && filters.sort !== "recent") params.set("sort", filters.sort);
    return params;
  }, []);

  // Pure data fetch — never touches the URL. The URL (searchParams) is the
  // single source of truth for what to fetch; see the effect below. Callers
  // that change filters/page must go through `navigate()`, not this function
  // directly, or the fetch driven by the resulting searchParams change would
  // duplicate this one (previously fired every search/page click twice, with
  // no request cancellation — a source of flicker and stale-result races).
  const fetchJobs = useCallback(async (page: number, filters: Record<string, string>) => {
    setLoading(true);
    setError("");
    try {
      const params = buildQuery(page, filters);
      const data = await apiFetch<{
        jobs?: Job[];
        pagination?: PaginationMeta;
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
      }>(`/jobs?${params}`, { suppressGlobalErrors: true });
      // Defensive: a single malformed/partial entry in this array must not
      // crash the whole listing (and with it, every "Apply" link on the page).
      setJobs((data.jobs || []).filter(Boolean));
      const meta = data.pagination || data;
      setPagination({
        page: meta.page || 1,
        limit: meta.limit || 12,
        total: meta.total || 0,
        totalPages: meta.totalPages || 1,
      });
    } catch {
      setError(dict.jobsList.loadError);
    } finally {
      setLoading(false);
    }
  }, [buildQuery, dict.jobsList.loadError]);

  // The only place a filter/page change should be requested from — updates
  // the URL, and the effect below (the single fetch trigger) reacts to it.
  const navigate = useCallback((page: number, filters: Record<string, string>) => {
    router.push(`/Vagas-Disponiveis?${buildQuery(page, filters).toString()}`);
  }, [router, buildQuery]);

  useEffect(() => {
    const initialFilters = {
      keyword: searchParams.get("keyword") || "",
      location: searchParams.get("provinceCity") || "",
      category: searchParams.get("category") || "",
      workMode: searchParams.get("workMode") || "",
      contractType: searchParams.get("contractType") || "",
      seniority: searchParams.get("seniority") || "",
      salaryMin: searchParams.get("salaryMin") || "",
      datePosted: searchParams.get("datePostedDays") || "",
      sort: searchParams.get("sort") || "recent",
    };
    const initialPage = Number(searchParams.get("page") || "1") || 1;
    setKeyword(initialFilters.keyword);
    setLocation(initialFilters.location);
    setCategory(initialFilters.category);
    setWorkMode(initialFilters.workMode);
    setContractType(initialFilters.contractType);
    setSeniority(initialFilters.seniority);
    setSalaryMin(initialFilters.salaryMin);
    setDatePosted(initialFilters.datePosted);
    setSort(initialFilters.sort);
    if (initialFilters.contractType || initialFilters.seniority || initialFilters.salaryMin || initialFilters.datePosted) {
      setShowFilters(true);
    }
    setApplied(initialFilters);
    fetchJobs(initialPage, initialFilters);
  }, [fetchJobs, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const f = { keyword, location, category, workMode, contractType, seniority, salaryMin, datePosted, sort };
    setApplied(f);
    track("job_search", { province: location || "all", category: category || "all" });
    navigate(1, f);
  };

  const goPage = (n: number) => {
    navigate(n, applied);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-600">{dict.jobsList.eyebrow}</p>
          <h1 className="mt-2 text-4xl font-bold">{dict.jobsList.title}</h1>
          <p className="mt-2 text-gray-600">
            {pagination.total > 0 ? dict.jobsList.activeSummary(pagination.total) : dict.jobsList.loadingSummary}
          </p>
        </div>

        <form onSubmit={handleSearch}>
          <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 grid gap-3 md:grid-cols-4">
            <input className="app-input" placeholder={dict.jobsList.searchKeyword} value={keyword} onChange={e => setKeyword(e.target.value)} />
            <select className="app-input" value={location} onChange={e => setLocation(e.target.value)} aria-label="Província">
              <option value="">{dict.jobsList.searchLocation}</option>
              {ANGOLA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="app-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">{dict.jobsList.allCategories}</option>
              <option value="Tecnologia">{categoryLabels.Tecnologia}</option>
              <option value="Energia">{categoryLabels.Energia}</option>
              <option value="Saude">{categoryLabels.Saude}</option>
              <option value="Banca e Financas">{categoryLabels["Banca e Financas"]}</option>
              <option value="Logistica">{categoryLabels.Logistica}</option>
              <option value="Recursos Humanos">{categoryLabels["Recursos Humanos"]}</option>
              <option value="Comercial">{categoryLabels.Comercial}</option>
              <option value="Biscato">Biscato (trabalho ocasional)</option>
            </select>
            <div className="flex gap-2">
              <select className="app-input flex-1" value={workMode} onChange={e => setWorkMode(e.target.value)}>
                <option value="">{dict.jobsList.modePlaceholder}</option>
                <option value="Presencial">{modeLabels.Presencial}</option>
                <option value="Hibrido">{modeLabels.Hibrido}</option>
                <option value="Remoto">{modeLabels.Remoto}</option>
                <option value="Rotativo">{modeLabels.Rotativo}</option>
              </select>
              <button type="submit" className="app-btn-primary px-4 text-sm">{dict.jobsList.searchButton}</button>
            </div>

            {showFilters && (
              <div className="md:col-span-4 grid gap-3 pv-animate-fade sm:grid-cols-2 lg:grid-cols-4">
                <select className="app-input" value={contractType} onChange={e => setContractType(e.target.value)} aria-label="Tipo de contrato">
                  <option value="">Tipo de contrato</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Contrato">Contrato</option>
                  <option value="Estagio">Estágio</option>
                  <option value="Temporario">Temporário</option>
                </select>
                <select className="app-input" value={seniority} onChange={e => setSeniority(e.target.value)} aria-label="Senioridade">
                  <option value="">Senioridade</option>
                  <option value="Junior">Júnior</option>
                  <option value="Mid">Intermédio</option>
                  <option value="Senior">Sénior</option>
                  <option value="Lead">Lead / Gestão</option>
                </select>
                <input className="app-input" type="number" min="0" step="50000" placeholder="Salário mínimo (Kz)" value={salaryMin} onChange={e => setSalaryMin(e.target.value)} />
                <select className="app-input" value={datePosted} onChange={e => setDatePosted(e.target.value)} aria-label="Data de publicação">
                  <option value="">Qualquer data</option>
                  <option value="1">Últimas 24h</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                </select>
              </div>
            )}

            <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setShowFilters(v => !v)} className="text-sm font-semibold text-red-700 hover:underline">
                {showFilters ? "− Menos filtros" : "+ Mais filtros"}
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Ordenar:
                <select className="app-input w-auto py-1.5" value={sort} onChange={e => { setSort(e.target.value); const f = { keyword, location, category, workMode, contractType, seniority, salaryMin, datePosted, sort: e.target.value }; setApplied(f); navigate(1, f); }} aria-label="Ordenar resultados">
                  <option value="recent">Mais recentes</option>
                  <option value="salary">Maior salário</option>
                  <option value="relevance">Relevância</option>
                </select>
              </label>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-6">
            <InlineErrorState
              title="Não foi possível carregar esta informação"
              message="Verifique a ligação e tente novamente."
              actionLabel="Recarregar"
              onAction={() => fetchJobs(pagination.page || 1, applied)}
            />
          </div>
        )}
        {loading && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="app-card p-5">
                <div className="flex items-start gap-3">
                  <div className="app-skeleton h-11 w-11 rounded-xl" />
                  <div className="flex-1">
                    <div className="app-skeleton h-5 w-4/5" />
                    <div className="app-skeleton mt-2 h-3.5 w-1/2" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="app-skeleton h-5 w-20 rounded-full" />
                  <div className="app-skeleton h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-8 grid items-stretch gap-5 pv-stagger sm:grid-cols-2 xl:grid-cols-3">
            {jobs.length === 0 && (
              <p className="col-span-full py-12 text-center text-gray-500">{dict.jobsList.empty}</p>
            )}
            {jobs.map((job, index) => {
              const mode = job.workMode || job.mode || "";
              const name = companyName(job);
              const logo = companyLogo(job);
              return [
                <article key={job._id} className="app-card app-card-interactive flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    {logo ? (
                      <Image src={logo} alt={`Logo ${name}`} width={44} height={44} className="shrink-0 h-11 w-11 rounded-xl border border-gray-200 object-cover" unoptimized />
                    ) : (
                      <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-red-700 font-bold text-sm">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-base font-bold leading-snug">{job.title}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
                        <span className="truncate">{name}</span>
                        {!job.externalCompanyName && job.companyId && typeof job.companyId === "object" && job.companyId.verified && (
                          <span className="app-badge app-badge-success shrink-0" title="Empresa verificada">
                            <CheckBadgeIcon className="h-3.5 w-3.5" /> Verificada
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.location && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        <MapPinIcon className="h-3 w-3" aria-hidden="true" /> {job.location}
                      </span>
                    )}
                    {mode && <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${modeColor[mode] ?? "bg-gray-100 text-gray-700"}`}>{modeLabels[mode] ?? mode}</span>}
                    {job.category && <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${categoryColor[job.category] ?? "bg-gray-100 text-gray-700"}`}>{job.category}</span>}
                    {(job.contractType || job.jobType) && <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{job.contractType || job.jobType}</span>}
                  </div>
                  {job.requiredSkills && job.requiredSkills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.requiredSkills.slice(0, 4).map(s => <span key={s} className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 text-gray-600">{s}</span>)}
                    </div>
                  )}
                  <div className="mt-auto pt-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
                      {job.salaryRange && (
                        <span className="inline-flex items-center gap-1"><BanknotesIcon className="h-3.5 w-3.5" aria-hidden="true" /> {job.salaryRange}</span>
                      )}
                      {(job.requiredExperienceYears ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1"><AcademicCapIcon className="h-3.5 w-3.5" aria-hidden="true" /> {dict.jobDetail.yearsExperience(job.requiredExperienceYears ?? 0)}</span>
                      )}
                      {job.expiresAt && (
                        <span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" aria-hidden="true" /> {new Date(job.expiresAt).toLocaleDateString("pt-AO", { day: "numeric", month: "short", year: "numeric" })}</span>
                      )}
                    </div>
                    <Link href={`/Vagas-Disponiveis/${job._id}`} className="app-btn-secondary mt-3 block w-full py-2 text-center text-sm">
                      {dict.jobsList.viewDetails}
                    </Link>
                  </div>
                </article>,
                (index + 1) % 6 === 0 ? (
                  <SponsoredAdSlot
                    key={`ad-after-${index}`}
                    placement="job_list"
                    fallbackTitle=""
                    fallbackDescription=""
                    className="sm:col-span-2 xl:col-span-3"
                  />
                ) : null,
              ];
            })}
          </div>
        )}

        {!loading && pagination.totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <button disabled={pagination.page <= 1} onClick={() => goPage(pagination.page - 1)} className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-40">← {dict.jobsList.prev}</button>
            <span className="text-sm text-gray-600">{dict.jobsList.pageOf(pagination.page, pagination.totalPages)}</span>
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => goPage(pagination.page + 1)} className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-40">{dict.jobsList.next} →</button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function VagasDisponiveisPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading jobs...</div>}>
      <VagasDisponiveisContent />
    </Suspense>
  );
}
