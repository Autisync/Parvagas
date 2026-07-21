import { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";

// Regenerate the sitemap hourly at runtime (ISR) rather than freezing it at
// build time. Combined with the per-fetch timeout below, a slow or down API
// during a deploy can never stall the build or permanently omit URLs — the
// next hourly regeneration picks them back up.
export const revalidate = 3600;

// Bound each upstream call so a hanging API can't stall generation.
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchCareerSlugs(): Promise<string[]> {
  const data = await fetchJson<{ posts?: { slug?: string }[] }>("/api/v1/public/career/posts");
  return (data?.posts ?? []).map((p) => p.slug).filter(Boolean) as string[];
}

async function fetchJobIds(): Promise<string[]> {
  const data = await fetchJson<{ jobs?: { _id?: string }[] }>("/api/v1/public/homepage");
  return (data?.jobs ?? []).map((j) => j._id).filter(Boolean) as string[];
}

type LegalDocSummary = { slug: string; effectiveDate: string | null };

// Fetched live rather than hardcoded — the legal-document set is admin-
// editable (Wave L, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md) and already grew
// from 4 to 10 public/employer documents once; hardcoding this list here
// would silently go stale on the next one. lastModified uses each
// document's real effectiveDate instead of "now" so search engines see an
// accurate change signal.
async function fetchLegalDocuments(): Promise<LegalDocSummary[]> {
  const data = await fetchJson<{ documents?: LegalDocSummary[] }>("/api/v1/legal/documents");
  return data?.documents ?? [];
}

function legalDocPath(slug: string): string {
  return slug === "msa" || slug === "dpa" ? `/legal/${slug}` : `/${slug}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/Vagas-Disponiveis`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/Empresa`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/Dicas-de-Carreira`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/Acesso`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/legal`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  const [careerSlugs, jobIds, legalDocs] = await Promise.all([fetchCareerSlugs(), fetchJobIds(), fetchLegalDocuments()]);

  const legalRoutes: MetadataRoute.Sitemap = legalDocs.map((doc) => ({
    url: `${BASE}${legalDocPath(doc.slug)}`,
    lastModified: doc.effectiveDate ? new Date(doc.effectiveDate) : now,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  const careerRoutes: MetadataRoute.Sitemap = careerSlugs.map((slug) => ({
    url: `${BASE}/Dicas-de-Carreira/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const jobRoutes: MetadataRoute.Sitemap = jobIds.map((id) => ({
    url: `${BASE}/Vagas-Disponiveis/${id}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...legalRoutes, ...careerRoutes, ...jobRoutes];
}
