import Header from "../../components/Header";
import Footer from "../../components/Footer";
import Link from "next/link";
import Image from "next/image";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";

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
  } | string;
};

async function getJob(id: string): Promise<Job | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/jobs/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.job || null;
  } catch {
    return null;
  }
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);

  if (!job) {
    return (
      <div className="bg-white min-h-screen">
        <Header />
        <main className="px-6 py-8 max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mt-12">Vaga não encontrada</h1>
          <p className="text-gray-500 mt-2">Esta vaga pode ter sido removida ou já não está disponível.</p>
          <Link href="/Vagas-Disponiveis" className="mt-6 inline-block text-red-600 font-medium hover:underline">← Voltar às vagas</Link>
        </main>
        <Footer />
      </div>
    );
  }

  const company = job.companyId && typeof job.companyId === "object" ? job.companyId : null;
  const companyName = company?.name ?? "Empresa";
  const mode = job.workMode || "";

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 max-w-5xl mx-auto">
        <Breadcrumbs
          className="mb-8"
          items={[
            { label: "Início", href: "/" },
            { label: "Vagas", href: "/Vagas-Disponiveis" },
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
                  <p className="text-gray-500 mt-0.5">{companyName}{company?.industry ? ` · ${company.industry}` : ""}</p>
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
                <h2 className="text-xl font-bold mb-3">Sobre a vaga</h2>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">{job.description}</div>
              </section>
            )}

            {job.responsibilities && job.responsibilities.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3">Responsabilidades</h2>
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
                <h2 className="text-xl font-bold mb-3">Competências obrigatórias</h2>
                <div className="flex flex-wrap gap-2">
                  {job.requiredSkills.map(s => <span key={s} className="text-sm border border-red-200 rounded-lg px-3 py-1 text-red-700 bg-red-50">{s}</span>)}
                </div>
              </section>
            )}

            {job.preferredSkills && job.preferredSkills.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-3">Competências valorizadas</h2>
                <div className="flex flex-wrap gap-2">
                  {job.preferredSkills.map(s => <span key={s} className="text-sm border border-gray-200 rounded-lg px-3 py-1 text-gray-600">{s}</span>)}
                </div>
              </section>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="space-y-6">
            <div className="rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-lg mb-4">Resumo</h3>
              <dl className="space-y-3 text-sm">
                {job.salaryRange && (
                  <>
                    <dt className="text-gray-500">Salário</dt>
                    <dd className="font-medium text-gray-800">{job.salaryRange}</dd>
                  </>
                )}
                {(job.requiredExperienceYears || job.experienceLevel) && (
                  <>
                    <dt className="text-gray-500">Experiência</dt>
                    <dd className="font-medium">{job.requiredExperienceYears ? `${job.requiredExperienceYears}+ anos` : job.experienceLevel}</dd>
                  </>
                )}
                {job.expiresAt && (
                  <>
                    <dt className="text-gray-500">Válido até</dt>
                    <dd className="font-medium">{new Date(job.expiresAt).toLocaleDateString("pt-AO", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </>
                )}
                {job.createdAt && (
                  <>
                    <dt className="text-gray-500">Publicado em</dt>
                    <dd className="font-medium">{new Date(job.createdAt).toLocaleDateString("pt-AO", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </>
                )}
                {job.languages && job.languages.length > 0 && (
                  <>
                    <dt className="text-gray-500">Idiomas</dt>
                    <dd className="font-medium">{job.languages.join(", ")}</dd>
                  </>
                )}
              </dl>
            </div>

            {company && (company.description || company.size || company.website) && (
              <div className="rounded-2xl border border-gray-100 p-5">
                <h3 className="font-bold text-lg mb-3">Empresa</h3>
                {company.description && <p className="text-sm text-gray-600 mb-3 leading-relaxed">{company.description}</p>}
                {company.size && <p className="text-sm text-gray-500">Dimensão: <strong>{company.size}</strong></p>}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-red-600 hover:underline mt-1 block">{company.website}</a>
                )}
              </div>
            )}

            <Link
              href={`/Aplicar/${job._id}`}
              className="block w-full text-center rounded-xl bg-red-600 text-white font-semibold py-3 hover:bg-red-700 transition-colors"
            >
              Candidatar-me agora
            </Link>

            <Link href="/Vagas-Disponiveis" className="block text-center text-sm text-gray-500 hover:text-red-600">← Ver todas as vagas</Link>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
