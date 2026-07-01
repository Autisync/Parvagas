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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/Vagas-Disponiveis`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/Empresa`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/Dicas-de-Carreira`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/Acesso`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/politica-retencao`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/termos-empregador`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const [careerSlugs, jobIds] = await Promise.all([fetchCareerSlugs(), fetchJobIds()]);

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

  return [...staticRoutes, ...careerRoutes, ...jobRoutes];
}
