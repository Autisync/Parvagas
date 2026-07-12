"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch, authFetchRaw, getErrorMessage } from "@/lib/api";
import BannerError from "@/app/components/errors/BannerError";
import { ArrowLeftIcon, ArrowDownTrayIcon, CheckIcon } from "@heroicons/react/24/outline";

type ResumeData = Record<string, unknown>;

type Resume = {
  id: string;
  title: string;
  summary: string | null;
  data: ResumeData;
  is_draft: boolean;
  is_published: boolean;
};

// Section rail — only "Resumo" has a real editor in this iteration (A2, the
// shell). The rest are wired up in A3; showing them now (as "em breve")
// keeps the full structure visible so the guided, checklist-style rail from
// the UX spec is in place from the start, not bolted on later.
const SECTIONS = [
  { key: "resumo", label: "Resumo", ready: true },
  { key: "experiencia", label: "Experiência", ready: false },
  { key: "educacao", label: "Educação", ready: false },
  { key: "competencias", label: "Competências", ready: false },
  { key: "idiomas", label: "Idiomas", ready: false },
  { key: "certificacoes", label: "Certificações", ready: false },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const AUTOSAVE_DEBOUNCE_MS = 10000;

export default function ConstrutorCvEditorPage() {
  const { token, loading: authLoading } = useAuth("candidate", { allowAdmin: false });
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resumeId = params.id;

  const [resume, setResume] = useState<Resume | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("resumo");
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  // Local edit buffer, decoupled from the fetched `resume` so typing never
  // waits on a network round-trip.
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const debouncedTitle = useDebounce(title, AUTOSAVE_DEBOUNCE_MS);
  const debouncedSummary = useDebounce(summary, AUTOSAVE_DEBOUNCE_MS);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);

  const load = useCallback(async () => {
    if (!token || !resumeId) return;
    setError("");
    try {
      const data = await authFetch<Resume>(`/resumes/${resumeId}`, token);
      setResume(data);
      setTitle(data.title);
      setSummary((data.data?.professionalSummary as string) || data.summary || "");
      hydrated.current = true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar este CV."));
    } finally {
      setFetching(false);
    }
  }, [token, resumeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Autosave — fires on the debounced value, never blocks typing. Only
  // sends the fields this iteration's editor actually touches (title,
  // professionalSummary inside `data`); A3's section editors will extend
  // this same pattern per section rather than replacing it.
  useEffect(() => {
    if (!hydrated.current || !token || !resume) return;
    if (debouncedTitle === resume.title && debouncedSummary === ((resume.data?.professionalSummary as string) || resume.summary || "")) {
      return;
    }
    const save = async () => {
      setSaveState("saving");
      try {
        const nextData = { ...resume.data, professionalSummary: debouncedSummary };
        const updated = await authFetch<Resume>(`/resumes/${resumeId}`, token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: debouncedTitle || "Sem título", summary: debouncedSummary, data: nextData }),
        });
        setResume(updated);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    };
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedSummary]);

  const exportResume = async (format: "pdf" | "docx") => {
    if (!token) return;
    setExporting(format);
    try {
      const res = await authFetchRaw(`/resumes/${resumeId}/export?format=${format}`, token);
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
      setExporting(null);
    }
  };

  if (authLoading || fetching) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (error && !resume) {
    return <BannerError title="Erro" message={error} actionLabel="Voltar" onAction={() => router.push("/Portal/Candidato/Construtor-CV")} />;
  }

  if (!resume) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/Portal/Candidato/Construtor-CV")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Os meus CVs
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500" aria-live="polite">
            {saveState === "saving" && "A guardar…"}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckIcon className="h-3.5 w-3.5" /> Guardado
              </span>
            )}
            {saveState === "error" && <span className="text-red-600">Erro ao guardar</span>}
          </span>
          <button
            type="button"
            onClick={() => exportResume("pdf")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> {exporting === "pdf" ? "A exportar…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {error && <div className="mb-4"><BannerError title="Erro" message={error} /></div>}

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do CV"
        className="mb-6 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xl font-bold text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
      />

      <div className="grid gap-6 lg:grid-cols-[240px,1fr,1fr]">
        {/* Section rail */}
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition lg:shrink ${
                activeSection === section.key
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{section.label}</span>
              {!section.ready && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">em breve</span>}
            </button>
          ))}
        </nav>

        {/* Editor pane */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {activeSection === "resumo" ? (
            <div>
              <label htmlFor="resume-summary" className="block text-sm font-semibold text-slate-800">Resumo profissional</label>
              <p className="mt-1 text-xs text-slate-500">Descreva quem é e o que procura em 2-3 frases.</p>
              <textarea
                id="resume-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={8}
                placeholder="Ex: Engenheira de software com 5 anos de experiência em..."
                className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
              />
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-center">
              <p className="text-sm text-slate-500">
                O editor de {SECTIONS.find((s) => s.key === activeSection)?.label.toLowerCase()} chega na próxima
                iteração — os dados do seu perfil já estão guardados no CV se o criou "a partir do meu perfil".
              </p>
            </div>
          )}
        </div>

        {/* Preview pane — real rendering arrives in A4; placeholder for now */}
        <div className="hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 lg:flex lg:min-h-[300px] lg:items-center lg:justify-center">
          <p className="text-center text-sm text-slate-500">Pré-visualização disponível na próxima iteração.<br />Use "Exportar PDF" para ver o resultado atual.</p>
        </div>
      </div>
    </div>
  );
}
