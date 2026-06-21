"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/app/components/PageHeader";
import { AcademicCapIcon, BellIcon } from "@heroicons/react/24/outline";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

export default function EmpresaDefinicoesPage() {
  const { loading } = useAuth("company");
  const [message, setMessage] = useState("");

  const openTutorial = () => {
    localStorage.setItem("parvagas_company_tutorial_replay", "1");
    window.dispatchEvent(new Event("parvagas:open-company-tutorial"));
    setMessage("Tutorial aberto. O progresso volta a ser guardado automaticamente.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
          <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
            <CompanySidebar />
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />

          <div className="space-y-6">
            <PageHeader
              title="Definições da Empresa"
              description="Reabra o guia do portal e ajuste comportamentos operacionais da equipa."
              badge="Configuração"
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <AcademicCapIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900">Tutorial do portal da empresa</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Guia multi-passo com progresso guardado para ajudar novos utilizadores a concluir perfil, publicar vagas e operar notificações.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openTutorial}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  Ver tutorial novamente
                </button>
              </div>
              {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <BellIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Centro de notificações</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Alertas operacionais e mensagens internas ficam disponíveis no sino da barra lateral em todas as páginas do portal.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
