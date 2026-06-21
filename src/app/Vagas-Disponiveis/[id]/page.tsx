import Header from "../../components/Header";
import Footer from "../../components/Footer";
import SponsoredAdSlot from "@/app/components/SponsoredAdSlot";
import Link from "next/link";
import Image from "next/image";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { getServerDictionary } from "@/lib/i18n/server";
import { serverGetJson } from "@/lib/dataClient";
import ReportJobButton from "./ReportJobButton";

type Job = {
  _id: string;
  title: string;
  description?: string;
  responsibilities?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  location?: string;
  workMode?: string;
  category?: string;
  contractType?: string;
  jobType?: string;
  salaryRange?: string;
  experienceLevel?: string;
  requiredExperienceYears?: number;
  expiresAt?: string;
  createdAt?: string;
  languages?: string[];
  companyId?: {
    _id?: string;
    name?: string;
    industry?: string;
    size?: string;
    website?: string;
    description?: string;
    logo?: string;
    verified?: boolean;
  } | string;
};

async function getJob(id: string): Promise<Job | null> {
  const data = await serverGetJson<{ job?: Job }>(`/jobs/${id}`, { revalidateSeconds: 60 });
  return data?.job || null;
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  const dict = await getServerDictionary();

  if (!job) {
    return (
      <div className="bg-white min-h-screen">
        <Header />
        <main className="px-6 py-8 max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mt-12">{dict.jobDetail.notFoundTitle}</h1>
          <p className="text-gray-500 mt-2">{dict.jobDetail.notFoundDescription}</p>
          <Link href="/Vagas-Disponiveis" className="mt-6 inline-block text-red-600 font-medium hover:underline">← {dict.jobDetail.backToJobs}</Link>
        </main>
        <Footer />
      </div>
    );
  }

  const company = job.companyId && typeof job.companyId === "object" ? job.companyId : null;
  const companyName = company?.name ?? dict.jobDetail.companyFallback;
  const mode = job.workMode || "";

  const jobLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || job.title,
    datePosted: job.createdAt,
    employmentType: job.contractType || job.jobType || undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: companyName,
      ...(company?.website ? { sameAs: company.website } : {}),
      ...(company?.logo ? { logo: company.logo } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.location || "Angola", addressCountry: "AO" },
    },
    ...(job.salaryRange ? { baseSalary: { "@type": "MonetaryAmount", currency: "AOA", value: { "@type": "QuantitativeValue", value: job.salaryRange } } } : {}),
  };

  return (
    <div className="bg-white min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobLd) }} />
      <Header />
      <main className="px-6 py-8 max-w-5xl mx-auto">
        <Breadcrumbs
          className="mb-8"
          items={[
            { label: dict.jobDetail.breadcrumbHome, href: "/" },
            { label: dict.jobDetail.breadcrumbJobs, href: "/Vagas-Disponiveis" },
            { label: job.title },
          ]}
        />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex items-center gap-4 mb-4">
                {company?.logo ? (
                  <Image src={company.logo} alt={`Logo ${companyName}`} width={56} height={56} className="h-14 w-14 rounded-2xl border border-gray-200 object-cover" unoptimized />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-red-700 font-bold text-lg">
                    {companyName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-3xl font-bold">{job.title}</h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-gray-500">
                    <span>{companyName}{company?.industry ? ` · ${company.industry}` : ""}</span>
                    {company?.verified && (
                      <span className="app-badge app-badge-success" title="Empresa verificada pela Parvagas">✓ Empresa verificada</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {job.location && <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">📍 {job.location}</span>}
                {mode && <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{mode}</span>}
                {job.category && <span className="text-xs px-3 py-1 rounded-full bg-red-50 text-red-700 font-medium">{job.category}</span>}
                {(job.contractType || job.jobType) && <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">{job.contractType || job.jobType}</span>}
              </div>
            </div>

            {job.description && (
              <section>
                <h2 className="text-xl font-bold mb-3">{dict.jobDetail.aboutJob}</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">{job.description}</div>
              </section>
            )}

            {job.responsibilities && job.responsibilities.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3">{dict.jobDetail.responsibilities}</h2>
                <ul className="space-y-2">
                  {job.responsibilities.map((r, i) => (
                    <li key={i} className="flex gap-2 text-gray-700">
                      <span className="text-red-500 mt-0.5">▸</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {job.requiredSkills && job.requiredSkills.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3">{dict.jobDetail.requiredSkills}</h2>
                <div className="flex flex-wrap gap-2">
                  {job.requiredSkills.map(s => <span key={s} className="text-sm border border-red-200 rounded-lg px-3 py-1 text-red-700 bg-red-50">{s}</span>)}
                </div>
              </section>
            )}

            {job.preferredSkills && job.preferredSkills.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3">{dict.jobDetail.preferredSkills}</h2>
                <div className="flex flex-wrap gap-2">
                  {job.preferredSkills.map(s => <span key={s} className="text-sm border border-gray-200 rounded-lg px-3 py-1 text-gray-600">{s}</span>)}
                </div>
              </section>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="space-y-6">
            <div className="app-card p-5">
              <h3 className="font-bold text-lg mb-4">{dict.jobDetail.summary}</h3>
              <dl className="space-y-3 text-sm">
                {job.salaryRange && (
                  <>
                    <dt className="text-gray-500">{dict.jobDetail.salary}</dt>
                    <dd className="font-medium text-gray-800">{job.salaryRange}</dd>
                  </>
                )}
                {(job.requiredExperienceYears || job.experienceLevel) && (
                  <>
                    <dt className="text-gray-500">{dict.jobDetail.experience}</dt>
                    <dd className="font-medium">{job.requiredExperienceYears ? dict.jobDetail.yearsExperience(job.requiredExperienceYears) : job.experienceLevel}</dd>
                  </>
                )}
                {job.expiresAt && (
                  <>
                    <dt className="text-gray-500">{dict.jobDetail.validUntil}</dt>
                    <dd className="font-medium">{new Date(job.expiresAt).toLocaleDateString("pt-AO", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </>
                )}
                {job.createdAt && (
                  <>
                    <dt className="text-gray-500">{dict.jobDetail.publishedOn}</dt>
                    <dd className="font-medium">{new Date(job.createdAt).toLocaleDateString("pt-AO", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </>
                )}
                {job.languages && job.languages.length > 0 && (
                  <>
                    <dt className="text-gray-500">{dict.jobDetail.languages}</dt>
                    <dd className="font-medium">{job.languages.join(", ")}</dd>
                  </>
                )}
              </dl>
            </div>

            {company && (company.description || company.size || company.website) && (
              <div className="app-card p-5">
                <h3 className="font-bold text-lg mb-3">{dict.jobDetail.company}</h3>
                {company.description && <p className="text-sm text-gray-600 mb-3 leading-relaxed">{company.description}</p>}
                {company.size && <p className="text-sm text-gray-500">{dict.jobDetail.companySize}: <strong>{company.size}</strong></p>}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-red-600 hover:underline mt-1 block">{company.website}</a>
                )}
              </div>
            )}

            <Link
              href={`/Aplicar/${job._id}`}
              className="block w-full text-center rounded-xl bg-red-600 text-white font-semibold py-3 hover:bg-red-700 transition-colors"
            >
              {dict.jobDetail.applyNow}
            </Link>

            <Link href="/Vagas-Disponiveis" className="block text-center text-sm text-gray-500 hover:text-red-600">← {dict.jobDetail.viewAllJobs}</Link>

            <div className="pt-1 text-center">
              <ReportJobButton jobId={job._id} />
            </div>

            <SponsoredAdSlot
              placement="sidebar"
              fallbackTitle="Publicidade"
              fallbackDescription="Espaço reservado para anúncio patrocinado."
            />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
