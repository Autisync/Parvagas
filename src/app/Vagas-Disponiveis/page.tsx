"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import BannerError from "@/app/components/errors/BannerError";

type Job = {
  _id: string;
  title: string;
  companyId?: { name?: string; industry?: string; logo?: string } | string;
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

function companyName(job: Job): string {
  if (job.companyId && typeof job.companyId === "object") return job.companyId.name || "Empresa";
  return "Empresa";
}

function companyLogo(job: Job): string | null {
  if (job.companyId && typeof job.companyId === "object") return job.companyId.logo || null;
  return null;
}

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
  const [applied, setApplied] = useState({ keyword: "", location: "", category: "", workMode: "" });
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

  const fetchJobs = useCallback(async (
    page = 1,
    filters = { keyword: "", location: "", category: "", workMode: "" },
    updateUrl = true
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.location) params.set("provinceCity", filters.location);
      if (filters.category) params.set("category", filters.category);
      if (filters.workMode) params.set("workMode", filters.workMode);
      if (updateUrl) router.push(`/Vagas-Disponiveis?${params.toString()}`);
      const res = await fetch(apiUrl(`/jobs?${params}`));
      const data = await res.json();
      setJobs(data.jobs || []);
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
  }, [router, dict.jobsList.loadError]);

  useEffect(() => {
    const initialFilters = {
      keyword: searchParams.get("keyword") || "",
      location: searchParams.get("provinceCity") || "",
      category: searchParams.get("category") || "",
      workMode: searchParams.get("workMode") || "",
    };
    const initialPage = Number(searchParams.get("page") || "1") || 1;
    setKeyword(initialFilters.keyword);
    setLocation(initialFilters.location);
    setCategory(initialFilters.category);
    setWorkMode(initialFilters.workMode);
    setApplied(initialFilters);
    fetchJobs(initialPage, initialFilters, false);
  }, [fetchJobs, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const f = { keyword, location, category, workMode };
    setApplied(f);
    fetchJobs(1, f);
  };

  const goPage = (n: number) => {
    fetchJobs(n, applied);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-6xl">
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
            <input className="app-input" placeholder={dict.jobsList.searchLocation} value={location} onChange={e => setLocation(e.target.value)} />
            <select className="app-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">{dict.jobsList.allCategories}</option>
              <option value="Tecnologia">{categoryLabels.Tecnologia}</option>
              <option value="Energia">{categoryLabels.Energia}</option>
              <option value="Saude">{categoryLabels.Saude}</option>
              <option value="Banca e Financas">{categoryLabels["Banca e Financas"]}</option>
              <option value="Logistica">{categoryLabels.Logistica}</option>
              <option value="Recursos Humanos">{categoryLabels["Recursos Humanos"]}</option>
              <option value="Comercial">{categoryLabels.Comercial}</option>
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
          </div>
        </form>

        {error && (
          <div className="mt-6">
            <BannerError
              title="Não foi possível carregar as vagas"
              message={error}
              actionLabel="Reconectar"
              onAction={() => fetchJobs(pagination.page || 1, applied)}
            />
          </div>
        )}
        {loading && <div className="mt-12 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>}

        {!loading && !error && (
          <div className="mt-8 grid gap-4">
            {jobs.length === 0 && <p className="text-gray-500 text-center py-12">{dict.jobsList.empty}</p>}
            {jobs.map(job => {
              const mode = job.workMode || job.mode || "";
              const name = companyName(job);
              const logo = companyLogo(job);
              return (
                <article key={job._id} className="app-card p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    {logo ? (
                      <Image src={logo} alt={`Logo ${name}`} width={44} height={44} className="shrink-0 h-11 w-11 rounded-xl border border-gray-200 object-cover" unoptimized />
                    ) : (
                      <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-red-700 font-bold text-sm">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold leading-snug">{job.title}</h2>
                      <p className="text-sm text-gray-500">{name}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.location && <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">📍 {job.location}</span>}
                    {mode && <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${modeColor[mode] ?? "bg-gray-100 text-gray-700"}`}>{modeLabels[mode] ?? mode}</span>}
                    {job.category && <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${categoryColor[job.category] ?? "bg-gray-100 text-gray-700"}`}>{job.category}</span>}
                    {(job.contractType || job.jobType) && <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{job.contractType || job.jobType}</span>}
                  </div>
                  {job.requiredSkills && job.requiredSkills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.requiredSkills.slice(0, 5).map(s => <span key={s} className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 text-gray-600">{s}</span>)}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      {job.salaryRange && <span>💰 {job.salaryRange}</span>}
                      {(job.requiredExperienceYears ?? 0) > 0 && <span>🎓 {dict.jobDetail.yearsExperience(job.requiredExperienceYears ?? 0)}</span>}
                      {job.expiresAt && <span>⏳ Expira {new Date(job.expiresAt).toLocaleDateString("pt-AO", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    </div>
                    <Link href={`/Vagas-Disponiveis/${job._id}`} className="app-btn-secondary text-sm px-4 py-1.5">{dict.jobsList.viewDetails}</Link>
                  </div>
                </article>
              );
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
