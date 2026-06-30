import { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";

async function fetchCareerSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/public/career/posts`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: { slug?: string }[] };
    return (data.posts ?? []).map((p) => p.slug).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

async function fetchJobIds(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/public/homepage`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: { _id?: string }[] };
    return (data.jobs ?? []).map((j) => j._id).filter(Boolean) as string[];
  } catch {
    return [];
  }
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
