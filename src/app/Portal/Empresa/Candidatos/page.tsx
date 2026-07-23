"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch, ApiError, getErrorMessage } from "@/lib/api";
import StickyPortalHeading from "@/app/Portal/components/StickyPortalHeading";
import { MagnifyingGlassIcon, MapPinIcon, BriefcaseIcon, XMarkIcon, PhoneIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

type SearchResult = {
  userId: string;
  fullName: string;
  jobTitle?: string;
  location?: string;
  yearsOfExperience?: number;
  skills?: string[];
  summary?: string;
};

type FullProfile = SearchResult & {
  phone?: string;
  email?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  professionalSummary?: string;
  experience?: unknown[];
  education?: unknown[];
  languages?: string[];
};

const LIMIT = 20;

export default function CandidatosPage() {
  const { token, loading } = useAuth("company");
  const [keyword, setKeyword] = useState("");
  const debouncedKeyword = useDebounce(keyword, 400);
  const [location, setLocation] = useState("");
  const debouncedLocation = useDebounce(location, 400);
  const [minYears, setMinYears] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, debouncedLocation, minYears]);

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    setError("");
    setQuotaExceeded(false);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (debouncedKeyword.trim()) params.set("keyword", debouncedKeyword.trim());
    if (debouncedLocation.trim()) params.set("location", debouncedLocation.trim());
    if (minYears.trim()) params.set("minYears", minYears.trim());

    authFetch<{ candidates: SearchResult[]; total: number; totalPages: number }>(
      `/companies/candidates/search?${params.toString()}`,
      token,
      { suppressGlobalErrors: true }
    )
      .then((d) => {
        setResults(d.candidates || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch((err: unknown) => {
        setResults([]);
        setError(getErrorMessage(err, "Não foi possível pesquisar candidatos."));
        setQuotaExceeded(err instanceof ApiError && err.status === 402);
      })
      .finally(() => setFetching(false));
  }, [token, page, debouncedKeyword, debouncedLocation, minYears]);

  const openProfile = async (userId: string) => {
    if (!token) return;
    setSelectedId(userId);
    setProfile(null);
    setProfileError("");
    setProfileLoading(true);
    try {
      const res = await authFetch<{ profile: FullProfile }>(`/companies/candidates/${userId}`, token);
      setProfile(res.profile);
    } catch (err: unknown) {
      setProfileError(getErrorMessage(err, "Não foi possível carregar este perfil."));
    } finally {
      setProfileLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <StickyPortalHeading
        title="Candidatos"
        subtitle="Pesquise candidatos que optaram por tornar o seu perfil visível a empresas."
        meta={!fetching && !quotaExceeded ? `${total} candidato${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}` : undefined}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cargo, competências ou resumo"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <div className="relative">
          <MapPinIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Localização"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <div className="relative">
          <BriefcaseIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="number"
            min={0}
            value={minYears}
            onChange={(e) => setMinYears(e.target.value)}
            placeholder="Anos de experiência (mín.)"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          {quotaExceeded && (
            <Link
              href="/Portal/Empresa/Planos"
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Fazer upgrade do plano
            </Link>
          )}
        </div>
      )}

      {fetching ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
        </div>
      ) : !error && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
          Nenhum candidato encontrado com estes filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => openProfile(c.userId)}
              className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-red-200 hover:shadow-md"
            >
              <p className="text-sm font-bold text-slate-900">{c.fullName}</p>
              {c.jobTitle && <p className="mt-0.5 text-sm text-slate-600">{c.jobTitle}</p>}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {c.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="h-3.5 w-3.5" /> {c.location}
                  </span>
                )}
                {typeof c.yearsOfExperience === "number" && (
                  <span className="inline-flex items-center gap-1">
                    <BriefcaseIcon className="h-3.5 w-3.5" /> {c.yearsOfExperience} anos
                  </span>
                )}
              </div>
              {c.summary && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{c.summary}</p>}
              {c.skills && c.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.skills.slice(0, 4).map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {!fetching && !error && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-500">Página {page} de {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Seguinte
          </button>
        </div>
      )}

      {selectedId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Perfil do candidato</h2>
              <button type="button" onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {profileLoading ? (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
              </div>
            ) : profileError ? (
              <p className="text-sm text-rose-600">{profileError}</p>
            ) : profile ? (
              <div className="space-y-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{profile.fullName}</p>
                  {profile.jobTitle && <p className="text-sm text-slate-600">{profile.jobTitle}</p>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
                  {profile.phone && (
                    <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1.5 hover:text-red-600">
                      <PhoneIcon className="h-4 w-4" /> {profile.phone}
                    </a>
                  )}
                  {profile.email && (
                    <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 hover:text-red-600">
                      <EnvelopeIcon className="h-4 w-4" /> {profile.email}
                    </a>
                  )}
                </div>
                {(profile.professionalSummary || profile.summary) && (
                  <p className="text-sm text-slate-600">{profile.professionalSummary || profile.summary}</p>
                )}
                {profile.skills && profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-red-600">
                  {profile.linkedinUrl && (
                    <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-red-700">
                      LinkedIn
                    </a>
                  )}
                  {profile.portfolioUrl && (
                    <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-red-700">
                      Portfólio
                    </a>
                  )}
                  {profile.githubUrl && (
                    <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-red-700">
                      GitHub
                    </a>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
