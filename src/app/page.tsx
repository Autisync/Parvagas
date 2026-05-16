import { Metadata } from "next";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";
import { serverGetJson } from "@/lib/dataClient";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Início",
    description:
      "Parvagas é um site de recrutamento em Angola que recolhe CV's para Partilhar com Empresas procurando Talentos Profissionais.",
    url: "https://parVagas.co.ao",
    siteName: "parVagas",
    images: [
      {
        url: "https://www.segucyber.ao/public/OG/homepage.png",
        width: 300,
        height: 300,
      },
    ],
    locale: "pt",
    type: "website",
  },
};

type Job = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  mode?: string;
  category?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryRange?: string;
  companyId?: { name?: string } | string | null;
};

type CareerPost = {
  _id: string;
  slug: string;
  title: string;
  category?: string;
  excerpt?: string;
  readTime?: string;
  publishedAt?: string;
};

async function getHomepageData(): Promise<{
  featuredJobs: Job[];
  featuredCareerPosts: CareerPost[];
}> {
  const data = await serverGetJson<{ featuredJobs: Job[]; featuredCareerPosts: CareerPost[] }>(
    "/public/homepage?jobsLimit=6&postsLimit=3",
    { revalidateSeconds: 300 },
  );
  if (!data) {
    return { featuredJobs: [], featuredCareerPosts: [] };
  }
  return data;
}

function salaryLabel(job: Job): string | null {
  if (job.salaryRange) return job.salaryRange;
  if (job.salaryMin && job.salaryMax) {
    const fmt = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
    return `${fmt(job.salaryMin)} – ${fmt(job.salaryMax)} Kz`;
  }
  return null;
}

export default async function Home() {
  const { featuredJobs, featuredCareerPosts } = await getHomepageData();
  const dict = await getServerDictionary();

  return (
    <div className="bg-white text-gray-900">
      <Header />

      {/* Hero */}
      <section className="pt-12 pb-16 px-6 bg-gradient-to-b from-red-50 to-white">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-red-600 font-semibold">{dict.home.eyebrow}</p>
          <h1 className="mt-4 text-4xl sm:text-6xl font-bold leading-tight">
            {dict.home.title}
          </h1>
          <p className="mt-6 text-lg text-gray-700 max-w-3xl mx-auto">
            {dict.home.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/Submission/" className="app-btn-primary px-6 py-3">
              {dict.home.ctaCreateProfile}
            </Link>
            <Link href="/Vagas-Disponiveis/" className="app-btn-secondary px-6 py-3">
              {dict.home.ctaViewJobs}
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 px-6">
        <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-2">
          <article className="app-card p-8">
            <h2 className="text-2xl font-bold text-red-600">{dict.home.onboardingTitle}</h2>
            <p className="mt-3 text-gray-700">{dict.home.onboardingDesc}</p>
          </article>
          <article className="app-card p-8">
            <h2 className="text-2xl font-bold text-red-600">{dict.home.hiringTitle}</h2>
            <p className="mt-3 text-gray-700">{dict.home.hiringDesc}</p>
          </article>
        </div>
      </section>

      {/* Featured Jobs — DB-driven, up to 6 */}
      <section className="py-14 px-6 bg-red-50/60">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold">{dict.home.featuredJobsTitle}</h2>
            <Link href="/Vagas-Disponiveis/" className="text-sm text-red-700 font-semibold hover:underline">
              {dict.home.viewAll} →
            </Link>
          </div>

          {featuredJobs.length === 0 ? (
            <p className="text-gray-500 text-center py-12">{dict.home.noFeaturedJobs}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {featuredJobs.map((job) => {
                const company =
                  job.companyId && typeof job.companyId === "object" ? job.companyId : null;
                const companyName = company?.name ?? "Empresa";
                const salary = salaryLabel(job);
                return (
                  <article
                    key={job._id}
                    className="rounded-2xl bg-white p-5 border border-red-100 hover:shadow-md transition-shadow"
                  >
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">
                      {job.category ?? "Geral"}
                    </span>
                    <h3 className="font-bold text-base mt-2 leading-snug">{job.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{companyName}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                      {job.location && <span>📍 {job.location}</span>}
                      {(job.workMode ?? job.mode) && (
                        <span>· {job.workMode ?? job.mode}</span>
                      )}
                    </div>
                    {salary && (
                      <p className="mt-2 text-sm font-semibold text-gray-700">💰 {salary}</p>
                    )}
                    <Link
                      href={`/Vagas-Disponiveis/${job._id}`}
                      className="inline-block mt-4 text-red-700 font-semibold text-sm hover:underline"
                    >
                      {dict.home.seeJob} →
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Career tips preview + ads */}
      <section className="py-14 px-6">
        <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-2">
          {/* Career posts — DB-driven */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold">{dict.home.careerTipsTitle}</h2>
              <Link href="/Dicas-de-Carreira/" className="text-sm text-red-700 font-semibold hover:underline">
                {dict.home.viewAllTips} →
              </Link>
            </div>
            {featuredCareerPosts.length === 0 ? (
              <p className="text-gray-500 text-sm">{dict.home.tipsSoon}</p>
            ) : (
              <div className="space-y-4">
                {featuredCareerPosts.map((post) => (
                  <Link
                    key={post._id}
                    href={`/Dicas-de-Carreira/${post.slug}`}
                    className="block rounded-2xl border border-red-100 p-5 hover:shadow-sm transition-shadow group"
                  >
                    {post.category && (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">
                        {post.category}
                      </span>
                    )}
                    <h3 className="font-bold text-base mt-2 leading-snug group-hover:text-red-700 transition-colors">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{post.excerpt}</p>
                    )}
                    {post.readTime && (
                      <p className="text-xs text-gray-400 mt-2">⏱ {post.readTime}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Ad / info block */}
          <article className="rounded-3xl p-8 bg-red-600 text-white self-start">
            <h2 className="text-2xl font-bold">{dict.home.adsTitle}</h2>
            <p className="mt-2">{dict.home.adsDesc}</p>
            <p className="mt-4 text-sm text-red-100">{dict.home.adsNote}</p>
          </article>
        </div>
      </section>

      <Footer />
    </div>
  );
}
