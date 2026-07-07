"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { apiFetch } from "@/lib/api";

type TrackedApplication = {
  _id: string;
  status: string;
  statusLabel: string;
  statusMessage: string;
  submittedAt?: string | null;
  job?: { _id: string; title?: string; location?: string } | null;
  companyName?: string | null;
};

function AcompanharInner() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const [application, setApplication] = useState<TrackedApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Link inválido: token em falta.");
      setLoading(false);
      return;
    }
    apiFetch<{ application: TrackedApplication }>(`/public/applications/track?token=${encodeURIComponent(token)}`)
      .then((data) => setApplication(data.application))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Não foi possível encontrar esta candidatura."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Acompanhar candidatura</h1>
        <p className="mt-2 text-sm text-slate-600">
          Estado da sua candidatura submetida sem conta Parvagas.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : application ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-red-600">{application.statusLabel}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">{application.job?.title || "Vaga"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {application.companyName || "Empresa"}
                {application.job?.location ? ` • ${application.job.location}` : ""}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-700">{application.statusMessage}</p>
              {application.submittedAt && (
                <p className="mt-4 text-xs text-slate-400">
                  Submetida em {new Date(application.submittedAt).toLocaleDateString("pt-AO")}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Quer acompanhar todas as suas candidaturas num único lugar?</p>
          <p className="mt-1">Crie uma conta gratuita e nunca mais perca o estado de uma candidatura.</p>
          <Link href="/Signup" className="mt-3 inline-block app-btn-primary px-5 py-2.5 text-sm">
            Criar conta
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function AcompanharCandidaturaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <Header />
          <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
            <div className="h-40 animate-pulse rounded-2xl bg-white" />
          </main>
          <Footer />
        </div>
      }
    >
      <AcompanharInner />
    </Suspense>
  );
}
