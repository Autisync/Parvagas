"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw, getErrorMessage } from "@/lib/api";
import BannerError from "@/app/components/errors/BannerError";
import {
  PlusIcon, DocumentDuplicateIcon, TrashIcon, ArrowDownTrayIcon, PencilIcon,
} from "@heroicons/react/24/outline";

type ResumeSummary = {
  id: string;
  title: string;
  summary: string | null;
  template_id: string | null;
  is_draft: boolean;
  is_published: boolean;
  updated_at: string;
};

function completenessOf(resume: ResumeSummary): number {
  // Cheap proxy until the editor's per-section state (A3) can report a real
  // score: has a summary + isn't a bare draft with nothing touched.
  let score = 20;
  if (resume.summary && resume.summary.trim().length > 10) score += 40;
  if (resume.is_published) score += 40;
  return Math.min(100, score);
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export default function ConstrutorCvListPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const data = await authFetch<ResumeSummary[]>("/resumes/", token);
      setResumes(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar os seus CVs."));
    } finally {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const createResume = async (fromProfile: boolean) => {
    if (!token || creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await authFetch<ResumeSummary>("/resumes/", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fromProfile ? "O meu CV" : "Novo CV",
          from_profile: fromProfile,
          is_draft: true,
        }),
      });
      router.push(`/Portal/Candidato/Construtor-CV/${created.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível criar o CV."));
      setCreating(false);
    }
  };

  const duplicateResume = async (id: string) => {
    if (!token) return;
    setError("");
    try {
      await authFetch(`/resumes/${id}/duplicate`, token, { method: "POST" });
      load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível duplicar o CV."));
    }
  };

  const deleteResume = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Eliminar este CV? Esta ação não pode ser revertida.")) return;
    setError("");
    try {
      await authFetch(`/resumes/${id}`, token, { method: "DELETE" });
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível eliminar o CV."));
    }
  };

  const exportResume = async (id: string, format: "pdf" | "docx") => {
    if (!token) return;
    setExportingId(id);
    setError("");
    try {
      const res = await authFetchRaw(`/resumes/${id}/export?format=${format}`, token);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `cv.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível exportar o CV."));
    } finally {
      setExportingId(null);
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Construtor de CV</h1>
          <p className="mt-2 text-slate-600">Crie, edite e exporte os seus currículos diretamente no Parvagas.</p>
        </div>
      </div>

      {error && <div className="mb-6"><BannerError title="Erro" message={error} /></div>}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => createResume(true)}
          disabled={creating}
          className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-red-200 bg-red-50 p-5 text-left transition hover:border-red-300 hover:bg-red-100 disabled:opacity-60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
            <PlusIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-900">A partir do meu perfil</span>
            <span className="block text-xs text-slate-600">Pré-preenchido com os seus dados guardados — recomendado.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => createResume(false)}
          disabled={creating}
          className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white">
            <PlusIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-900">Começar do zero</span>
            <span className="block text-xs text-slate-600">Um CV em branco para preencher à sua maneira.</span>
          </span>
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">Ainda não tem nenhum CV. Crie o primeiro acima.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => {
            const completeness = completenessOf(resume);
            return (
              <div key={resume.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-900">{resume.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${resume.is_published ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {resume.is_published ? "Publicado" : "Rascunho"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Atualizado em {formatDate(resume.updated_at)}</p>

                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${completeness}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{completeness}% completo</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/Portal/Candidato/Construtor-CV/${resume.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <PencilIcon className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateResume(resume.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <DocumentDuplicateIcon className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => exportResume(resume.id, "pdf")}
                    disabled={exportingId === resume.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" /> {exportingId === resume.id ? "A exportar…" : "PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteResume(resume.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    <TrashIcon className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
