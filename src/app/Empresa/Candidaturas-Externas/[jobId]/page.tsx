"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { apiFetch } from "@/lib/api";

type ExternalApplication = {
  _id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  coverLetter?: string;
  status?: string;
  cvUrl?: string | null;
  submittedAt?: string | null;
};

type ExternalApplicationsResponse = {
  job: { _id: string; title?: string; companyName?: string };
  applications: ExternalApplication[];
};

function CandidaturasExternasInner() {
  const params = useParams<{ jobId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const [data, setData] = useState<ExternalApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params?.jobId) {
      setError("Link inválido: token em falta.");
      setLoading(false);
      return;
    }
    apiFetch<ExternalApplicationsResponse>(
      `/public/jobs/${encodeURIComponent(params.jobId)}/applications?token=${encodeURIComponent(token)}`,
    )
      .then((res) => setData(res))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Não foi possível carregar as candidaturas."))
      .finally(() => setLoading(false));
  }, [token, params?.jobId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Candidaturas recebidas</h1>
        {data?.job?.title && (
          <p className="mt-2 text-sm text-slate-600">
            Vaga: <span className="font-semibold text-slate-900">{data.job.title}</span>
            {data.job.companyName ? ` • ${data.job.companyName}` : ""}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Esta vaga não tem uma conta Parvagas associada.</p>
          <p className="mt-1">
            Está a ver as candidaturas através de um link seguro enviado por email. Para gerir vagas e candidaturas
            num painel completo (respostas, estados, histórico), crie uma conta de empresa gratuita.
          </p>
          <Link href="/Signup?role=company" className="mt-3 inline-block app-btn-primary px-5 py-2.5 text-sm">
            Criar conta de empresa
          </Link>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            </div>
          ) : error ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-red-600">{error}</p>
          ) : !data || data.applications.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Ainda não há candidaturas para esta vaga.
            </p>
          ) : (
            <div className="space-y-3">
              {data.applications.map((app) => (
                <article key={app._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{app.fullName || "Candidato"}</p>
                      <p className="text-sm text-slate-500">
                        {app.email} {app.phone ? `• ${app.phone}` : ""} {app.location ? `• ${app.location}` : ""}
                      </p>
                    </div>
                    {app.submittedAt && (
                      <span className="text-xs text-slate-400">
                        {new Date(app.submittedAt).toLocaleDateString("pt-AO")}
                      </span>
                    )}
                  </div>
                  {app.coverLetter && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-700">{app.coverLetter}</p>
                  )}
                  {app.cvUrl && (
                    <a
                      href={app.cvUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Descarregar CV
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function CandidaturasExternasPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
            <div className="h-40 animate-pulse rounded-2xl bg-white" />
          </main>
          <Footer />
        </div>
      }
    >
      <CandidaturasExternasInner />
    </Suspense>
  );
}
