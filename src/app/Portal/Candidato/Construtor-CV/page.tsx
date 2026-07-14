"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw, getErrorMessage } from "@/lib/api";
import BannerError from "@/app/components/errors/BannerError";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { track } from "@/lib/analytics";
import {
  PlusIcon, DocumentDuplicateIcon, TrashIcon, ArrowDownTrayIcon, PencilIcon,
  LinkIcon, ClipboardDocumentIcon, ArrowTopRightOnSquareIcon, UserIcon, ArrowPathIcon,
} from "@heroicons/react/24/outline";

type ResumeSummary = {
  id: string;
  title: string;
  summary: string | null;
  template_id: string | null;
  is_draft: boolean;
  is_published: boolean;
  share_slug: string | null;
  updated_at: string;
};

type CoverLetterSummary = {
  id: string;
  title: string;
  content: string;
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
  const { notify } = useAppNotifier();
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"cvs" | "cartas">("cvs");
  const [letters, setLetters] = useState<CoverLetterSummary[]>([]);
  const [lettersFetched, setLettersFetched] = useState(false);
  const [editingLetter, setEditingLetter] = useState<CoverLetterSummary | null>(null);
  const [letterDraft, setLetterDraft] = useState("");
  const [savingLetter, setSavingLetter] = useState(false);
  const [exportingLetterId, setExportingLetterId] = useState<string | null>(null);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);

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
    if (!token) return;
    authFetch<{ profile?: { updatedAt?: string } }>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then((d) => setProfileUpdatedAt(d.profile?.updatedAt || null))
      .catch(() => {});
  }, [token]);

  const loadLetters = useCallback(async () => {
    if (!token) return;
    try {
      setLetters(await authFetch<CoverLetterSummary[]>("/resumes/cover-letters", token));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar as suas cartas."));
    } finally {
      setLettersFetched(true);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "cartas" && !lettersFetched) loadLetters();
  }, [tab, lettersFetched, loadLetters]);

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
      notify("CV duplicado com sucesso.", "success");
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
      notify("CV eliminado.", "success");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível eliminar o CV."));
    }
  };

  const copyShareLink = async (shareSlug: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cv/${shareSlug}`);
      notify("Ligação copiada.", "success");
    } catch {
      notify("Não foi possível copiar a ligação.", "error");
    }
  };

  const applyToProfile = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Isto vai atualizar os campos do seu perfil (contactos, resumo, competências, experiência) com o conteúdo deste CV. Campos que este CV não preenche mantêm-se como estão. Continuar?")) return;
    setError("");
    try {
      const result = await authFetch<{ updated_fields: string[]; cv_document_id: string | null }>(
        `/resumes/${id}/apply-to-profile`, token, { method: "POST" },
      );
      if (result.updated_fields.length === 0) {
        notify("O perfil já estava atualizado — nada para sincronizar.", "info");
      } else {
        const labels: Record<string, string> = {
          phone: "telefone", location: "localização", postcode: "código postal",
          linkedin_url: "LinkedIn", portfolio_url: "portefólio", github_url: "GitHub",
          job_title: "título profissional", professional_summary: "resumo",
          hard_skills: "competências técnicas", techniques: "técnicas/metodologias",
          tools: "ferramentas", languages: "idiomas", certifications: "certificações",
          work_experience: "experiência profissional", education: "educação",
        };
        const readable = result.updated_fields.map((f) => labels[f] || f).join(", ");
        notify(`Perfil atualizado: ${readable}.`, "success");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível aplicar o CV ao perfil."));
    }
  };

  const refreshFromProfile = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Isto vai substituir o conteúdo deste CV pelos dados atuais do seu perfil. Continuar?")) return;
    setError("");
    try {
      await authFetch(`/resumes/${id}/refresh-from-profile`, token, { method: "POST" });
      notify("CV atualizado com os dados mais recentes do seu perfil.", "success");
      load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível atualizar o CV a partir do perfil."));
    }
  };

  const exportResume = async (id: string, format: "pdf" | "docx" | "json") => {
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
      track("cv_exported", { format });
      notify(`CV exportado em ${format.toUpperCase()}.`, "success");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível exportar o CV."));
    } finally {
      setExportingId(null);
    }
  };

  const openLetter = (letter: CoverLetterSummary) => {
    setEditingLetter(letter);
    setLetterDraft(letter.content);
  };

  const saveLetter = async () => {
    if (!token || !editingLetter || savingLetter) return;
    setSavingLetter(true);
    try {
      const updated = await authFetch<CoverLetterSummary>(`/resumes/cover-letters/${editingLetter.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: letterDraft }),
      });
      setLetters((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setEditingLetter(null);
      notify("Carta guardada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível guardar a carta."), "error");
    } finally {
      setSavingLetter(false);
    }
  };

  const deleteLetter = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Eliminar esta carta? Esta ação não pode ser revertida.")) return;
    try {
      await authFetch(`/resumes/cover-letters/${id}`, token, { method: "DELETE" });
      setLetters((prev) => prev.filter((l) => l.id !== id));
      notify("Carta eliminada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível eliminar a carta."), "error");
    }
  };

  const exportLetter = async (id: string) => {
    if (!token) return;
    setExportingLetterId(id);
    try {
      const res = await authFetchRaw(`/resumes/cover-letters/${id}/export`, token);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "carta.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
      notify("Carta exportada em PDF.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível exportar a carta."), "error");
    } finally {
      setExportingLetterId(null);
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

      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setTab("cvs")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "cvs" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Currículos
        </button>
        <button
          type="button"
          onClick={() => setTab("cartas")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "cartas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Cartas
        </button>
      </div>

      {tab === "cartas" ? (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Cartas de apresentação geradas na candidatura premium ficam guardadas aqui — reveja, edite e exporte.
          </p>
          {letters.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">Ainda não tem nenhuma carta de apresentação.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {letters.map((letter) => (
                <div key={letter.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{letter.title}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${letter.is_published ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {letter.is_published ? "Finalizada" : "Rascunho"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Atualizada em {formatDate(letter.updated_at)}</p>
                  <p className="mt-3 line-clamp-3 text-xs text-slate-600">{letter.content}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openLetter(letter)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PencilIcon className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => exportLetter(letter.id)}
                      disabled={exportingLetterId === letter.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" /> {exportingLetterId === letter.id ? "…" : "PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLetter(letter.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingLetter && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{editingLetter.title}</h3>
                  <button type="button" onClick={() => setEditingLetter(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <textarea
                  value={letterDraft}
                  onChange={(e) => setLetterDraft(e.target.value)}
                  rows={14}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingLetter(null)} className="rounded border border-slate-300 px-3 py-1.5 text-sm">Cancelar</button>
                  <button type="button" onClick={saveLetter} disabled={savingLetter} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                    {savingLetter ? "A guardar…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
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

                {profileUpdatedAt && new Date(profileUpdatedAt) > new Date(resume.updated_at) && (
                  <button
                    type="button"
                    onClick={() => refreshFromProfile(resume.id)}
                    className="mt-3 flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-left text-xs text-blue-700 transition hover:bg-blue-100"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5 shrink-0" />
                    O seu perfil mudou desde que criou este CV — atualizar?
                  </button>
                )}

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
                    onClick={() => applyToProfile(resume.id)}
                    title="Atualizar o seu perfil com o conteúdo deste CV"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <UserIcon className="h-3.5 w-3.5" /> Aplicar ao perfil
                  </button>
                  {(["pdf", "docx", "json"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => exportResume(resume.id, fmt)}
                      disabled={exportingId === resume.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" /> {exportingId === resume.id ? "…" : fmt.toUpperCase()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => deleteResume(resume.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    <TrashIcon className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>

                {resume.is_published && resume.share_slug && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <a
                      href={`/cv/${resume.share_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-slate-600 hover:text-red-700 hover:underline"
                    >
                      {typeof window !== "undefined" ? window.location.host : "parvagas.pt"}/cv/{resume.share_slug}
                    </a>
                    <button
                      type="button"
                      onClick={() => copyShareLink(resume.share_slug as string)}
                      title="Copiar ligação"
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`/cv/${resume.share_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir ligação"
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                    >
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
