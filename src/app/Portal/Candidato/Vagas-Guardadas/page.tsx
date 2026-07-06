"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

type SavedJobItem = {
  _id: string;
  dateSaved?: string;
  status?: string;
  job?: {
    _id: string;
    title?: string;
    location?: string;
    status?: string;
    companyId?: { name?: string } | string;
  };
};

export default function VagasGuardadasPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [items, setItems] = useState<SavedJobItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (!token) return;
    authFetch<{ jobs: SavedJobItem[] }>("/candidates/jobs/saved?page=1&limit=20", token)
      .then((res) => setItems((res.jobs || []).filter(Boolean)))
      .catch((err: unknown) => setError((err as Error).message || "Erro ao carregar vagas guardadas."))
      .finally(() => setFetching(false));
  }, [token]);

  const unsave = async (savedRecordId: string, jobId: string) => {
    setRemovingId(savedRecordId);
    try {
      await authFetch(`/candidates/jobs/saved/${jobId}`, token!, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item._id !== savedRecordId));
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao remover vaga guardada.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading || fetching) {
    return (
      <div className="p-6 sm:p-8">
        <div className="app-skeleton h-9 w-56" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="app-card p-5">
              <div className="app-skeleton h-5 w-1/2" />
              <div className="app-skeleton mt-2 h-3.5 w-1/3" />
              <div className="app-skeleton mt-4 h-8 w-32 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Vagas Guardadas</h1>
        <p className="mt-2 text-slate-600">Gerencie as oportunidades guardadas e retome candidaturas quando quiser.</p>
      </div>

      {error ? <div className="mb-4"><InlineErrorState /></div> : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">Ainda não guardou nenhuma vaga.</p>
          <Link href="/Portal/Candidato/Vagas-Disponiveis" className="mt-3 inline-block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
            Explorar vagas disponíveis
          </Link>
          </div>
        ) : (
          <div className="space-y-3 pv-stagger">
            {items.map((item) => {
              const job = item.job;
              const company = job?.companyId && typeof job.companyId === "object" ? job.companyId.name : "Empresa";
              return (
                <article key={item._id} className="app-card app-card-interactive p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold">{job?.title || "Vaga"}</h2>
                      <p className="text-sm text-gray-500">{company || "Empresa"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {job?.location || "Local não informado"} • Guardada em {item.dateSaved ? new Date(item.dateSaved).toLocaleDateString("pt-AO") : "-"}
                      </p>
                    </div>
                    <span className="app-badge app-badge-neutral">{item.status && item.status !== "saved" ? item.status : "Guardada"}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {job?._id ? (
                      <Link href={`/Vagas-Disponiveis/${job._id}`} className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                        Ver detalhes
                      </Link>
                    ) : null}
                    {job?._id ? (
                      <button
                        onClick={() => unsave(item._id, job._id)}
                        disabled={removingId === item._id}
                        className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {removingId === item._id ? "A remover..." : "Remover"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </div>
  );
}
