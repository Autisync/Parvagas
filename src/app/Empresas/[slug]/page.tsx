/**
 * Public employer branding page (overnight-audit W5.3) — /Empresas/[slug]
 * renders a verified company's logo, story, culture content, and its own
 * open jobs on one shareable URL, no auth. Backed by
 * GET /public/companies/{slug}, which only resolves status === "active"
 * companies; anything else lands in the not-found state. Mirrors
 * src/app/cv/[slug]/page.tsx's server-component + generateMetadata shape.
 */
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { serverGetJson } from "@/lib/dataClient";
import { toJsonLdString } from "@/lib/jsonLd";
import { safeExternalHref } from "@/lib/safeUrl";

type PublicJob = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  contractType?: string;
  salaryRange?: string;
};

type PublicCompany = {
  _id: string;
  slug: string;
  name: string;
  website?: string | null;
  description?: string | null;
  logo?: string | null;
  angolanizacao?: boolean;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  benefits?: string[];
  socialLinks?: { linkedin?: string; facebook?: string; instagram?: string; twitter?: string };
  galleryPhotos?: string[];
};

type PublicCompanyResponse = { company: PublicCompany; jobs: PublicJob[]; totalJobs: number };

async function getPublicCompany(slug: string): Promise<PublicCompanyResponse | null> {
  return serverGetJson<PublicCompanyResponse>(`/public/companies/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 60,
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicCompany(slug);
  if (!data) return { title: "Empresa não encontrada" };

  const { company } = data;
  const title = `${company.name} — Vagas e perfil da empresa`;
  const description =
    (company.description || "").replace(/\s+/g, " ").trim().slice(0, 155) ||
    `Conheça a ${company.name} e veja as vagas abertas na Parvagas.`;
  const ogImage = `/Empresas/${slug}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: `/Empresas/${slug}` },
    openGraph: {
      title: `${title} | Parvagas`,
      description,
      url: `/Empresas/${slug}`,
      type: "website",
      siteName: "Parvagas",
      images: [ogImage],
    },
    twitter: { card: "summary_large_image", title: `${title} | Parvagas`, description, images: [ogImage] },
  };
}

export default async function PublicCompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicCompany(slug);

  if (!data) {
    return (
      <div className="bg-white min-h-screen">
        <Header />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Empresa não encontrada</h1>
          <p className="mt-2 text-slate-500">Esta página pode ter sido removida ou a empresa ainda não foi verificada.</p>
          <Link href="/Vagas-Disponiveis" className="mt-6 inline-block font-medium text-red-600 hover:underline">
            ← Ver vagas disponíveis
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const { company, jobs, totalJobs } = data;
  const websiteHref = safeExternalHref(company.website);
  const logoHref = safeExternalHref(company.logo);
  const socialLinks = company.socialLinks || {};
  const sameAs = [socialLinks.linkedin, socialLinks.facebook, socialLinks.instagram, socialLinks.twitter]
    .map((url) => safeExternalHref(url))
    .filter(Boolean) as string[];

  const orgLd = {
    "@context": "https://schema.org/",
    "@type": "Organization",
    name: company.name,
    ...(logoHref ? { logo: logoHref } : {}),
    ...(websiteHref ? { url: websiteHref } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  const shareUrl = `https://parvagas.pt/Empresas/${slug}`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(`${company.name} está a contratar na Parvagas: ${shareUrl}`)}`;
  const facebookShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="bg-white min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(orgLd) }} />
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Breadcrumbs
          className="mb-8"
          items={[
            { label: "Início", href: "/" },
            { label: "Vagas", href: "/Vagas-Disponiveis" },
            { label: company.name },
          ]}
        />

        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          {logoHref ? (
            <Image src={logoHref} alt={company.name} width={88} height={88} unoptimized className="h-22 w-22 shrink-0 rounded-2xl border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-22 w-22 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-2xl font-bold text-red-700">
              {getInitials(company.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{company.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Empresa verificada
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[company.industry, company.size, company.location].filter(Boolean).join(" · ")}
            </p>
            {websiteHref && (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium text-red-600 hover:underline">
                {company.website}
              </a>
            )}
          </div>
        </div>

        {company.description && (
          <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{company.description}</p>
        )}

        {company.benefits && company.benefits.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {company.benefits.map((benefit) => (
              <span key={benefit} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {benefit}
              </span>
            ))}
          </div>
        )}

        {company.galleryPhotos && company.galleryPhotos.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {company.galleryPhotos.map((photo) => (
              <Image key={photo} src={photo} alt={company.name} width={200} height={150} unoptimized className="h-32 w-full rounded-xl object-cover" />
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Partilhar</span>
          <a href={whatsappShareHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            WhatsApp
          </a>
          <a href={facebookShareHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Facebook
          </a>
        </div>

        <hr className="my-8 border-slate-100" />

        <h2 className="text-lg font-bold text-slate-900">Vagas abertas ({totalJobs})</h2>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Esta empresa não tem vagas abertas neste momento.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {jobs.map((job) => (
              <Link
                key={job._id}
                href={`/Vagas-Disponiveis/${job._id}`}
                className="rounded-2xl border border-slate-200 p-4 transition hover:border-red-200 hover:shadow-sm"
              >
                <p className="text-sm font-bold text-slate-900">{job.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[job.location, job.workMode, job.contractType].filter(Boolean).join(" · ")}
                </p>
                {job.salaryRange && <p className="mt-1 text-xs font-medium text-red-600">{job.salaryRange}</p>}
              </Link>
            ))}
          </div>
        )}
        {totalJobs > jobs.length && (
          <p className="mt-4 text-xs text-slate-500">
            +{totalJobs - jobs.length} outras vagas — contacte a empresa através de uma candidatura para saber mais.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
