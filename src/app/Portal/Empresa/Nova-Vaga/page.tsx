"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Footer from "@/app/components/Footer";
import Link from "next/link";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

const JobPostingModal = dynamic(() => import("../components/JobPostingModal"), {
  ssr: false,
});

export default function NovaVagaPage() {
  const { token, loading } = useAuth("company");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-8 px-6 pb-16 max-w-7xl mx-auto">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-3xl font-bold">Nova Vaga</h1>
            <p className="mt-2 text-gray-500">A criação de vagas agora é feita em modal para manter o fluxo rápido no portal.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setOpen(true)} className="app-btn-primary px-5 py-2.5 text-sm shadow-sm">
                Abrir modal de vaga
              </button>
              <Link href="/Portal/Empresa/Perfil" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                Voltar ao perfil
              </Link>
            </div>
          </section>
        </div>

        {token && (
          <JobPostingModal
            token={token}
            open={open}
            onClose={() => setOpen(false)}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
