"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch, authFetchRaw, getErrorMessage } from "@/lib/api";
import BannerError from "@/app/components/errors/BannerError";
import { useAppNotifier } from "@/app/components/AppNotifier";
import TagInput from "@/app/components/profile/TagInput";
import AddItemModal from "@/app/components/profile/AddItemModal";
import ExperienceCard, { type ExperienceItem } from "@/app/components/profile/ExperienceCard";
import EducationCard, { type EducationItem } from "@/app/components/profile/EducationCard";
import ResumePreview from "../preview/ResumePreview";
import RestorePass from "@/app/components/RestorePass";
import { track } from "@/lib/analytics";
import { SKILL_SUGGESTIONS, LANGUAGE_SUGGESTIONS, CERT_SUGGESTIONS } from "@/lib/suggestionCatalogs";
import { ArrowLeftIcon, ArrowDownTrayIcon, CheckIcon, ClockIcon, LinkIcon, PlusIcon, EyeIcon, ShareIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";

type ResumeData = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  professionalSummary?: string;
  workExperience?: ExperienceItem[];
  education?: EducationItem[];
  hardSkills?: string[];
  techniques?: string[];
  tools?: string[];
  languages?: string[];
  certifications?: string[];
  [key: string]: unknown;
};

type Resume = {
  id: string;
  title: string;
  summary: string | null;
  data: ResumeData;
  template_id: string | null;
  is_draft: boolean;
  is_published: boolean;
  share_slug: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type VersionMeta = {
  id: string;
  version_number: number;
  title: string;
  change_summary: string | null;
  created_at: string;
};

type VersionSnapshot = VersionMeta & { data: ResumeData };

type ScoreExplanation = {
  dimension: string;
  label: string;
  score: number | null;
  band: "excelente" | "boa" | "média" | "baixa" | null;
  explanation: string;
  suggestion: string | null;
};

type ScoreResult = {
  overall_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  formatting_score: number | null;
  ats_score: number | null;
  metadata: Record<string, unknown> | null;
  explanations?: ScoreExplanation[] | null;
};

type AdaptResult = {
  resume: Resume;
  changed: boolean;
  diff: { summary_changed: boolean; added_skills: string[] };
  job_title: string;
};

const SECTIONS = [
  { key: "dados", label: "Dados Pessoais" },
  { key: "resumo", label: "Resumo" },
  { key: "experiencia", label: "Experiência" },
  { key: "educacao", label: "Educação" },
  { key: "competencias", label: "Competências" },
  { key: "idiomas", label: "Idiomas" },
  { key: "certificacoes", label: "Certificações" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const AUTOSAVE_DEBOUNCE_MS = 10000;

const DEFAULT_EXPERIENCE: ExperienceItem = {
  jobTitle: "", company: "", location: "", startDate: "", endDate: "", current: false, description: "",
};
const DEFAULT_EDUCATION: EducationItem = {
  degree: "", institution: "", location: "", startDate: "", endDate: "", description: "",
};

function sectionHasContent(data: ResumeData, key: SectionKey): boolean {
  switch (key) {
    case "dados": return Boolean(data.fullName?.trim() && data.phone?.trim());
    case "resumo": return Boolean(data.professionalSummary?.trim());
    case "experiencia": return Boolean(data.workExperience?.length);
    case "educacao": return Boolean(data.education?.length);
    case "competencias": return Boolean(data.hardSkills?.length || data.techniques?.length || data.tools?.length);
    case "idiomas": return Boolean(data.languages?.length);
    case "certificacoes": return Boolean(data.certifications?.length);
  }
}

function completenessOf(title: string, data: ResumeData): { percent: number; nextAction: string } {
  const doneSections = SECTIONS.filter((s) => sectionHasContent(data, s.key));
  const total = SECTIONS.length + 1; // +1 for title
  const done = doneSections.length + (title.trim() ? 1 : 0);
  const percent = Math.round((done / total) * 100);
  const missing = SECTIONS.find((s) => !sectionHasContent(data, s.key));
  const nextAction = !title.trim()
    ? "Dê um título ao seu CV."
    : missing
      ? `Adicione ${missing.label.toLowerCase()}.`
      : "O seu CV está completo!";
  return { percent, nextAction };
}

function percentileHint(score: ScoreResult): string {
  const dims: [string, number | null][] = [
    ["Adicione mais competências relevantes para subir a pontuação de competências.", score.skills_score],
    ["Detalhe mais a experiência profissional (resultados, números) para subir essa pontuação.", score.experience_score],
    ["Dê um título ao CV e escreva um resumo para melhorar a formatação.", score.formatting_score],
    ["Use palavras-chave das vagas a que se candidata para melhorar a leitura por ATS.", score.ats_score],
  ];
  const scored = dims.filter((d): d is [string, number] => d[1] != null);
  if (!scored.length) return "Avaliação concluída.";
  const [hint, value] = scored.reduce((min, cur) => (cur[1] < min[1] ? cur : min));
  return value >= 85 ? "Excelente — o seu CV está bem otimizado." : `Próximo passo: ${hint}`;
}

const SCORE_BAND_STYLES: Record<string, { badge: string; ring: string; label: string }> = {
  excelente: { badge: "bg-emerald-100 text-emerald-700", ring: "border-emerald-200", label: "Excelente" },
  boa: { badge: "bg-emerald-50 text-emerald-700", ring: "border-emerald-100", label: "Boa" },
  média: { badge: "bg-amber-100 text-amber-700", ring: "border-amber-200", label: "Média" },
  baixa: { badge: "bg-red-100 text-red-700", ring: "border-red-200", label: "Baixa" },
};

/** One score dimension, explained for someone who has never heard of an ATS
 * score before: what it means, why it landed here, and — only when there's
 * actually something to fix — a concrete next step. */
function ScoreExplanationCard({ item }: { item: ScoreExplanation }) {
  const styles = item.band ? SCORE_BAND_STYLES[item.band] : null;
  return (
    <div className={`rounded-lg border bg-white p-3 ${styles?.ring || "border-slate-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-slate-900">{item.score == null ? "—" : Math.round(item.score)}</span>
          {styles && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles.badge}`}>{styles.label}</span>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.explanation}</p>
      {item.suggestion && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
          <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>{item.suggestion}</span>
        </p>
      )}
    </div>
  );
}

export default function ConstrutorCvEditorPage() {
  const { token, user, loading: authLoading } = useAuth("candidate", { allowAdmin: false });
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const resumeId = params.id;
  const { notify } = useAppNotifier();

  const [resume, setResume] = useState<Resume | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("dados");
  const [exporting, setExporting] = useState<"pdf" | "docx" | "json" | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [versionPreview, setVersionPreview] = useState<VersionSnapshot | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"score" | "rewrite" | "adapt" | null>(null);
  const [showClaimPrompt, setShowClaimPrompt] = useState(false);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [savedJobs, setSavedJobs] = useState<{ id: string; title: string }[]>([]);
  const [adaptJobId, setAdaptJobId] = useState("");

  const [title, setTitle] = useState("");
  const [data, setData] = useState<ResumeData>({});
  const draft = useMemo(() => ({ title, data }), [title, data]);
  const debouncedDraft = useDebounce(draft, AUTOSAVE_DEBOUNCE_MS);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydrated = useRef(false);
  const lastSavedJson = useRef("");
  const completedSections = useRef<Set<SectionKey>>(new Set());

  // Experience/education modal state (mirrors the pattern already used in
  // CV-e-Documentos for the exact same ExperienceItem/EducationItem shapes).
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [draftExperience, setDraftExperience] = useState<ExperienceItem>(DEFAULT_EXPERIENCE);
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);
  const [expFormError, setExpFormError] = useState("");

  const [eduModalOpen, setEduModalOpen] = useState(false);
  const [draftEducation, setDraftEducation] = useState<EducationItem>(DEFAULT_EDUCATION);
  const [editingEduIndex, setEditingEduIndex] = useState<number | null>(null);
  const [eduFormError, setEduFormError] = useState("");

  const load = useCallback(async () => {
    if (!token || !resumeId) return;
    setError("");
    try {
      const fetched = await authFetch<Resume>(`/resumes/${resumeId}`, token);
      setResume(fetched);
      setTitle(fetched.title);
      setData(fetched.data || {});
      setTemplateId(fetched.template_id || null);
      setIsPublished(Boolean(fetched.is_published));
      setShareSlug(fetched.share_slug || null);
      lastSavedJson.current = JSON.stringify({ title: fetched.title, data: fetched.data || {} });
      hydrated.current = true;
      completedSections.current = new Set(SECTIONS.filter((s) => sectionHasContent(fetched.data || {}, s.key)).map((s) => s.key));
      track("builder_opened");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar este CV."));
    } finally {
      setFetching(false);
    }
  }, [token, resumeId]);

  useEffect(() => {
    load();
  }, [load]);

  // D3: fire section_completed exactly once per section, the moment it
  // transitions from empty/partial to done — not on every keystroke.
  useEffect(() => {
    if (!hydrated.current) return;
    for (const section of SECTIONS) {
      if (sectionHasContent(data, section.key) && !completedSections.current.has(section.key)) {
        completedSections.current.add(section.key);
        track("section_completed", { section: section.key });
      }
    }
  }, [data]);

  // Template list is public metadata — load once, failure is non-fatal
  // (picker simply doesn't render and the default template applies).
  useEffect(() => {
    if (!token) return;
    authFetch<TemplateOption[]>("/resumes/templates", token)
      .then(setTemplates)
      .catch(() => setTemplates([]));
    // Saved jobs feed the "Adaptar a esta vaga" picker — same source and
    // shape as CV-e-Documentos's tailored-export selector.
    authFetch<{ jobs: { job?: { _id: string; title?: string } }[] }>("/candidates/jobs/saved?page=1&limit=20", token)
      .then((d) => {
        const options = (d.jobs || [])
          .filter((item): item is { job: { _id: string; title?: string } } => Boolean(item.job?._id))
          .map((item) => ({ id: item.job._id, title: item.job.title || "Vaga" }));
        setSavedJobs(options);
      })
      .catch(() => setSavedJobs([]));
  }, [token]);

  const runScore = async () => {
    if (!token || aiBusy) return;
    setAiBusy("score");
    try {
      const result = await authFetch<ScoreResult>("/resumes/score", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: resumeId }),
      });
      setScore(result);
      track("ai_action_used", { action: "score" });
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível avaliar o CV."), "error");
    } finally {
      setAiBusy(null);
    }
  };

  const runRewrite = async () => {
    if (!token || aiBusy) return;
    setAiBusy("rewrite");
    try {
      const result = await authFetch<{ title: string; summary: string; notes?: string; source?: string }>("/resumes/rewrite", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: resumeId, tone: "professional" }),
      });
      // The endpoint updates the resume's title/summary columns server-side;
      // mirror both into the editor state (summary lives in data.professionalSummary
      // here) so the next autosave doesn't silently revert the rewrite.
      if (result.title) setTitle(result.title);
      if (result.summary) setData((prev) => ({ ...prev, professionalSummary: result.summary }));
      track("ai_action_used", { action: "rewrite" });
      // source: "heuristic" means the AI path was unavailable and the resume
      // was returned UNCHANGED — result.summary is still non-empty in that
      // case (it's the pre-existing summary echoed back), so it can't be
      // used as the success signal, or this reads as success when nothing
      // happened.
      notify(result.notes || "Texto melhorado.", result.source === "heuristic" ? "info" : "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível melhorar o texto."), "error");
    } finally {
      setAiBusy(null);
    }
  };

  const runAdapt = async () => {
    if (!token || aiBusy || !adaptJobId) return;
    setAiBusy("adapt");
    try {
      const result = await authFetch<AdaptResult>(`/resumes/${resumeId}/adapt`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: adaptJobId }),
      });
      track("ai_action_used", { action: "adapt" });
      if (result.changed) {
        setData(result.resume.data || {});
        lastSavedJson.current = JSON.stringify({ title: result.resume.title, data: result.resume.data || {} });
        const parts = [
          result.diff.summary_changed ? "resumo atualizado" : null,
          result.diff.added_skills.length ? `+${result.diff.added_skills.length} competências (${result.diff.added_skills.join(", ")})` : null,
        ].filter(Boolean);
        notify(`CV adaptado à vaga "${result.job_title}": ${parts.join("; ")}. A versão anterior está no histórico.`, "success");
      } else {
        notify("Sem alterações — a adaptação por IA está indisponível ou a vaga não acrescenta nada ao seu CV.", "info");
      }
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível adaptar o CV."), "error");
    } finally {
      setAiBusy(null);
    }
  };

  const templateSlug = templates.find((t) => t.id === templateId)?.slug || null;

  const toggleShare = async () => {
    if (!token || sharing) return;
    setSharing(true);
    try {
      const updated = await authFetch<Resume>(`/resumes/${resumeId}/share`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !isPublished }),
      });
      setIsPublished(Boolean(updated.is_published));
      setShareSlug(updated.share_slug || null);
      notify(updated.is_published ? "CV publicado — a ligação está ativa." : "CV despublicado — a ligação foi desativada.", "success");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível alterar a partilha."));
    } finally {
      setSharing(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareSlug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cv/${shareSlug}`);
      notify("Ligação copiada.", "success");
    } catch {
      notify("Não foi possível copiar a ligação.", "error");
    }
  };

  const openVersions = async () => {
    if (!token) return;
    setVersionsOpen(true);
    setVersionPreview(null);
    try {
      setVersions(await authFetch<VersionMeta[]>(`/resumes/${resumeId}/versions`, token));
    } catch {
      setVersions([]);
    }
  };

  const viewVersion = async (versionId: string) => {
    if (!token) return;
    try {
      setVersionPreview(await authFetch<VersionSnapshot>(`/resumes/${resumeId}/versions/${versionId}`, token));
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível carregar a versão."), "error");
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!token || restoringId) return;
    setRestoringId(versionId);
    try {
      const copy = await authFetch<Resume>(`/resumes/${resumeId}/versions/${versionId}/restore`, token, { method: "POST" });
      notify("Versão restaurada como novo CV.", "success");
      setVersionsOpen(false);
      setRestoringId(null);
      router.push(`/Portal/Candidato/Construtor-CV/${copy.id}`);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível restaurar a versão."), "error");
      setRestoringId(null);
    }
  };

  const selectTemplate = async (template: TemplateOption) => {
    if (!token || template.id === templateId) return;
    const previous = templateId;
    setTemplateId(template.id); // instant preview switch, before the PATCH lands
    try {
      await authFetch(`/resumes/${resumeId}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });
      track("template_changed", { template: template.slug });
    } catch (err: unknown) {
      setTemplateId(previous);
      setError(getErrorMessage(err, "Não foi possível mudar o modelo."));
    }
  };

  // Autosave — one debounced snapshot of {title, data} covers every section,
  // so every editor below just calls setData/setTitle and this handles the
  // rest. Compares against the last-saved JSON so it never fires a no-op
  // PATCH (e.g. right after load, before the user has touched anything).
  useEffect(() => {
    if (!hydrated.current || !token) return;
    const nextJson = JSON.stringify(debouncedDraft);
    if (nextJson === lastSavedJson.current) return;

    const save = async () => {
      setSaveState("saving");
      try {
        const updated = await authFetch<Resume>(`/resumes/${resumeId}`, token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: debouncedDraft.title || "Sem título",
            summary: debouncedDraft.data.professionalSummary || "",
            data: debouncedDraft.data,
          }),
        });
        lastSavedJson.current = JSON.stringify({ title: updated.title, data: updated.data });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    };
    save();
  }, [debouncedDraft, token, resumeId]);

  const exportResume = async (format: "pdf" | "docx" | "json") => {
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
      track("cv_exported", { format });
      notify(`CV exportado em ${format.toUpperCase()}.`, "success");
      if (user?.isGuestAccount) setShowClaimPrompt(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível exportar o CV."));
    } finally {
      setExporting(null);
    }
  };

  // ---- Experience handlers ----
  const experienceList = data.workExperience || [];
  const openAddExperience = () => {
    setDraftExperience(DEFAULT_EXPERIENCE);
    setEditingExpIndex(null);
    setExpFormError("");
    setExpModalOpen(true);
  };
  const openEditExperience = (index: number) => {
    setDraftExperience(experienceList[index] || DEFAULT_EXPERIENCE);
    setEditingExpIndex(index);
    setExpFormError("");
    setExpModalOpen(true);
  };
  const saveExperience = () => {
    if (!draftExperience.jobTitle.trim() || !draftExperience.company.trim()) {
      setExpFormError("Preencha pelo menos o cargo e a empresa.");
      return;
    }
    const next = [...experienceList];
    if (editingExpIndex === null) next.unshift(draftExperience);
    else next[editingExpIndex] = draftExperience;
    setData((prev) => ({ ...prev, workExperience: next }));
    setExpModalOpen(false);
  };
  const deleteExperience = (index: number) => {
    setData((prev) => ({ ...prev, workExperience: experienceList.filter((_, i) => i !== index) }));
  };
  const moveExperience = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= experienceList.length) return;
    const next = [...experienceList];
    [next[index], next[target]] = [next[target], next[index]];
    setData((prev) => ({ ...prev, workExperience: next }));
  };

  // ---- Education handlers ----
  const educationList = data.education || [];
  const openAddEducation = () => {
    setDraftEducation(DEFAULT_EDUCATION);
    setEditingEduIndex(null);
    setEduFormError("");
    setEduModalOpen(true);
  };
  const openEditEducation = (index: number) => {
    setDraftEducation(educationList[index] || DEFAULT_EDUCATION);
    setEditingEduIndex(index);
    setEduFormError("");
    setEduModalOpen(true);
  };
  const saveEducation = () => {
    if (!draftEducation.degree.trim() || !draftEducation.institution.trim()) {
      setEduFormError("Preencha pelo menos o curso e a instituição.");
      return;
    }
    const next = [...educationList];
    if (editingEduIndex === null) next.unshift(draftEducation);
    else next[editingEduIndex] = draftEducation;
    setData((prev) => ({ ...prev, education: next }));
    setEduModalOpen(false);
  };
  const deleteEducation = (index: number) => {
    setData((prev) => ({ ...prev, education: educationList.filter((_, i) => i !== index) }));
  };
  const moveEducation = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= educationList.length) return;
    const next = [...educationList];
    [next[index], next[target]] = [next[target], next[index]];
    setData((prev) => ({ ...prev, education: next }));
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

  const { percent, nextAction } = completenessOf(title, data);

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
            onClick={openVersions}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ClockIcon className="h-3.5 w-3.5" /> Versões
          </button>
          <button
            type="button"
            onClick={toggleShare}
            disabled={sharing}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
              isPublished
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <ShareIcon className="h-3.5 w-3.5" /> {sharing ? "…" : isPublished ? "Público" : "Partilhar"}
          </button>
          {isPublished && shareSlug && (
            <button
              type="button"
              onClick={copyShareLink}
              title="Copiar ligação pública"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Copiar ligação
            </button>
          )}
          <div className="flex gap-1.5">
            {(["pdf", "docx", "json"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => exportResume(fmt)}
                disabled={exporting !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" /> {exporting === fmt ? "…" : fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="mb-4"><BannerError title="Erro" message={error} /></div>}

      {showClaimPrompt && user?.isGuestAccount && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Guarde o acesso a este CV</p>
            <p className="text-xs text-amber-700">
              Defina uma palavra-passe para poder voltar a entrar e continuar a editar mais tarde.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <RestorePass onSent={() => track("guest_converted")} />
            <button
              type="button"
              onClick={() => setShowClaimPrompt(false)}
              className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-100"
              aria-label="Dispensar"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do CV"
        className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xl font-bold text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
      />

      {/* Completeness meter — the single easiness lever from the UX spec:
          always visible, always says exactly what to do next. */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">O seu CV está {percent}% completo</span>
          <span className="text-slate-500">{nextAction}</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* AI tools (C2) — every action degrades gracefully: score falls back
          to the heuristic, rewrite/adapt report "no change" instead of
          failing when the LLM flags are off or the model is unreachable. */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <SparklesIcon className="h-4 w-4 text-red-600" /> Ferramentas IA
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runScore}
            disabled={aiBusy !== null}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {aiBusy === "score" ? "A avaliar…" : "Avaliar CV"}
          </button>
          <button
            type="button"
            onClick={runRewrite}
            disabled={aiBusy !== null}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {aiBusy === "rewrite" ? "A melhorar…" : "Melhorar texto"}
          </button>
          <div className="flex items-center gap-1.5">
            <select
              value={adaptJobId}
              onChange={(e) => setAdaptJobId(e.target.value)}
              disabled={savedJobs.length === 0}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 disabled:opacity-60"
            >
              <option value="">
                {savedJobs.length === 0 ? "Sem vagas guardadas" : "Adaptar a vaga…"}
              </option>
              {savedJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={runAdapt}
              disabled={aiBusy !== null || !adaptJobId}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {aiBusy === "adapt" ? "A adaptar…" : "Adaptar"}
            </button>
          </div>
        </div>

        {score && (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-900 shadow-sm">
                {score.overall_score == null ? "—" : Math.round(score.overall_score)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Pontuação geral do seu CV</p>
                <p className="text-xs text-slate-500">{percentileHint(score)}</p>
              </div>
            </div>

            {score.explanations && score.explanations.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {score.explanations.map((item) => (
                  <ScoreExplanationCard key={item.dimension} item={item} />
                ))}
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {([
                  ["Competências", score.skills_score],
                  ["Experiência", score.experience_score],
                  ["Formatação", score.formatting_score],
                  ["ATS", score.ats_score],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-center">
                    <p className="text-lg font-bold text-slate-900">{value == null ? "—" : Math.round(value)}</p>
                    <p className="text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px,1fr,1fr]">
        {/* Section rail */}
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((section) => {
            const done = sectionHasContent(data, section.key);
            return (
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
                <span className={`h-2 w-2 shrink-0 rounded-full ${done ? "bg-emerald-500" : "bg-slate-300"}`} />
              </button>
            );
          })}
        </nav>

        {/* Editor pane */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {activeSection === "dados" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="resume-fullname" className="block text-sm font-semibold text-slate-800">Nome completo</label>
                <input
                  id="resume-fullname"
                  type="text"
                  value={data.fullName || ""}
                  onChange={(e) => setData((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="resume-email" className="block text-sm font-semibold text-slate-800">Email</label>
                  <input
                    id="resume-email"
                    type="email"
                    value={data.email || ""}
                    onChange={(e) => setData((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
                <div>
                  <label htmlFor="resume-phone" className="block text-sm font-semibold text-slate-800">Telefone</label>
                  <input
                    id="resume-phone"
                    type="tel"
                    value={data.phone || ""}
                    onChange={(e) => setData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="resume-location" className="block text-sm font-semibold text-slate-800">Localização</label>
                <input
                  id="resume-location"
                  type="text"
                  value={data.location || ""}
                  onChange={(e) => setData((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Ex: Luanda, Angola"
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="resume-linkedin" className="block text-sm font-semibold text-slate-800">LinkedIn</label>
                  <input
                    id="resume-linkedin"
                    type="url"
                    value={data.linkedinUrl || ""}
                    onChange={(e) => setData((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
                <div>
                  <label htmlFor="resume-portfolio" className="block text-sm font-semibold text-slate-800">Portefólio</label>
                  <input
                    id="resume-portfolio"
                    type="url"
                    value={data.portfolioUrl || ""}
                    onChange={(e) => setData((prev) => ({ ...prev, portfolioUrl: e.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
                <div>
                  <label htmlFor="resume-github" className="block text-sm font-semibold text-slate-800">GitHub</label>
                  <input
                    id="resume-github"
                    type="url"
                    value={data.githubUrl || ""}
                    onChange={(e) => setData((prev) => ({ ...prev, githubUrl: e.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "resumo" && (
            <div>
              <label htmlFor="resume-summary" className="block text-sm font-semibold text-slate-800">Resumo profissional</label>
              <p className="mt-1 text-xs text-slate-500">Descreva quem é e o que procura em 2-3 frases.</p>
              <textarea
                id="resume-summary"
                value={data.professionalSummary || ""}
                onChange={(e) => setData((prev) => ({ ...prev, professionalSummary: e.target.value }))}
                rows={8}
                placeholder="Ex: Engenheira de software com 5 anos de experiência em..."
                className="mt-3 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100"
              />
            </div>
          )}

          {activeSection === "experiencia" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Experiência profissional</h3>
                <button
                  type="button"
                  onClick={openAddExperience}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
              {experienceList.length === 0 ? (
                <p className="text-sm text-slate-500">Ainda não adicionou nenhuma experiência.</p>
              ) : (
                <div className="space-y-3">
                  {experienceList.map((item, index) => (
                    <ExperienceCard
                      key={`${item.company}-${index}`}
                      item={item}
                      onEdit={() => openEditExperience(index)}
                      onDelete={() => deleteExperience(index)}
                      onMoveUp={index > 0 ? () => moveExperience(index, -1) : undefined}
                      onMoveDown={index < experienceList.length - 1 ? () => moveExperience(index, 1) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "educacao" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Formação académica</h3>
                <button
                  type="button"
                  onClick={openAddEducation}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
              {educationList.length === 0 ? (
                <p className="text-sm text-slate-500">Ainda não adicionou nenhuma formação.</p>
              ) : (
                <div className="space-y-3">
                  {educationList.map((item, index) => (
                    <EducationCard
                      key={`${item.institution}-${index}`}
                      item={item}
                      onEdit={() => openEditEducation(index)}
                      onDelete={() => deleteEducation(index)}
                      onMoveUp={index > 0 ? () => moveEducation(index, -1) : undefined}
                      onMoveDown={index < educationList.length - 1 ? () => moveEducation(index, 1) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "competencias" && (
            <div className="space-y-6">
              <TagInput
                label="Competências técnicas"
                placeholder="Ex: Python, Excel, Gestão de projetos"
                values={data.hardSkills || []}
                onChange={(next) => setData((prev) => ({ ...prev, hardSkills: next }))}
                suggestions={SKILL_SUGGESTIONS}
              />
              <TagInput
                label="Técnicas / Metodologias"
                placeholder="Ex: Scrum, Vendas B2B"
                values={data.techniques || []}
                onChange={(next) => setData((prev) => ({ ...prev, techniques: next }))}
                suggestions={SKILL_SUGGESTIONS}
              />
              <TagInput
                label="Ferramentas"
                placeholder="Ex: Docker, Photoshop, SAP"
                values={data.tools || []}
                onChange={(next) => setData((prev) => ({ ...prev, tools: next }))}
                suggestions={SKILL_SUGGESTIONS}
              />
            </div>
          )}

          {activeSection === "idiomas" && (
            <TagInput
              label="Idiomas"
              placeholder="Ex: Português (nativo), Inglês"
              values={data.languages || []}
              onChange={(next) => setData((prev) => ({ ...prev, languages: next }))}
              suggestions={LANGUAGE_SUGGESTIONS}
            />
          )}

          {activeSection === "certificacoes" && (
            <TagInput
              label="Certificações"
              placeholder="Ex: AWS Certified, PMP"
              values={data.certifications || []}
              onChange={(next) => setData((prev) => ({ ...prev, certifications: next }))}
              suggestions={CERT_SUGGESTIONS}
            />
          )}
        </div>

        {/* Preview pane — desktop only, sticky so it stays visible while
            editing. Mobile gets a floating button + full-screen sheet
            instead of a squeezed side-by-side pane, per the UX spec. */}
        <div className="hidden lg:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-slate-100 lg:p-4">
          {templates.length > 0 && (
            <TemplatePicker templates={templates} selectedId={templateId} onSelect={selectTemplate} />
          )}
          <p className="mb-2 text-center text-xs text-slate-500">Pré-visualização aproximada — o PDF exportado pode variar ligeiramente.</p>
          <ResumePreview data={data} templateSlug={templateSlug} />
        </div>
      </div>

      {/* Mobile floating preview trigger */}
      <button
        type="button"
        onClick={() => setMobilePreviewOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        <EyeIcon className="h-4 w-4" /> Pré-visualizar
      </button>

      {mobilePreviewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100 lg:hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Pré-visualização</span>
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(false)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500"
              aria-label="Fechar pré-visualização"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            {templates.length > 0 && (
              <TemplatePicker templates={templates} selectedId={templateId} onSelect={selectTemplate} />
            )}
            <p className="mb-2 text-center text-xs text-slate-500">Pré-visualização aproximada — o PDF exportado pode variar ligeiramente.</p>
            <ResumePreview data={data} templateSlug={templateSlug} />
          </div>
        </div>
      )}

      <AddItemModal
        open={versionsOpen}
        title="Histórico de versões"
        onClose={() => setVersionsOpen(false)}
      >
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ainda não há versões guardadas. Um snapshot é criado automaticamente à medida que edita
            (no máximo um a cada 30 minutos) e sempre que usa a reescrita com IA.
          </p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">v{version.version_number} — {version.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(version.created_at).toLocaleString("pt-PT")}
                    {version.change_summary ? ` · ${version.change_summary}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => viewVersion(version.id)}
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    onClick={() => restoreVersion(version.id)}
                    disabled={restoringId !== null}
                    className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {restoringId === version.id ? "A restaurar…" : "Restaurar como cópia"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {versionPreview && (
          <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
            <p className="mb-2 text-center text-xs text-slate-500">
              Pré-visualização da v{versionPreview.version_number} — só de leitura.
            </p>
            <ResumePreview data={versionPreview.data} templateSlug={templateSlug} />
          </div>
        )}
      </AddItemModal>

      <AddItemModal
        open={expModalOpen}
        title={editingExpIndex === null ? "Adicionar experiência" : "Editar experiência"}
        onClose={() => setExpModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cargo" value={draftExperience.jobTitle} onChange={(e) => setDraftExperience((prev) => ({ ...prev, jobTitle: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Empresa" value={draftExperience.company} onChange={(e) => setDraftExperience((prev) => ({ ...prev, company: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Local" value={draftExperience.location} onChange={(e) => setDraftExperience((prev) => ({ ...prev, location: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftExperience.startDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftExperience.endDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, endDate: e.target.value }))} disabled={draftExperience.current} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draftExperience.current} onChange={(e) => setDraftExperience((prev) => ({ ...prev, current: e.target.checked, endDate: e.target.checked ? "" : prev.endDate }))} />
            Trabalho atual
          </label>
        </div>
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição — comece com um verbo: 'Geri uma equipa de 5...'" value={draftExperience.description} onChange={(e) => setDraftExperience((prev) => ({ ...prev, description: e.target.value }))} />
        {expFormError ? <p className="mt-2 text-xs text-rose-700">{expFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setExpModalOpen(false)}>Cancelar</button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={saveExperience}>Guardar</button>
        </div>
      </AddItemModal>

      <AddItemModal
        open={eduModalOpen}
        title={editingEduIndex === null ? "Adicionar formação" : "Editar formação"}
        onClose={() => setEduModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Curso / Grau" value={draftEducation.degree} onChange={(e) => setDraftEducation((prev) => ({ ...prev, degree: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Instituição" value={draftEducation.institution} onChange={(e) => setDraftEducation((prev) => ({ ...prev, institution: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Local" value={draftEducation.location} onChange={(e) => setDraftEducation((prev) => ({ ...prev, location: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.startDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.endDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, endDate: e.target.value }))} />
        </div>
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição (opcional)" value={draftEducation.description} onChange={(e) => setDraftEducation((prev) => ({ ...prev, description: e.target.value }))} />
        {eduFormError ? <p className="mt-2 text-xs text-rose-700">{eduFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEduModalOpen(false)}>Cancelar</button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={saveEducation}>Guardar</button>
        </div>
      </AddItemModal>
    </div>
  );
}

/** Thumbnail cards for switching the visual template. The minis are drawn
 * with CSS (no image assets) so they can never drift from the real
 * templates the way stale preview_url screenshots would. */
function TemplatePicker({
  templates,
  selectedId,
  onSelect,
}: {
  templates: { id: string; name: string; slug: string; description: string | null }[];
  selectedId: string | null;
  onSelect: (template: { id: string; name: string; slug: string; description: string | null }) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-semibold text-slate-600">Modelo</p>
      <div className="flex gap-2">
        {templates.map((template) => {
          const selected = selectedId === template.id || (!selectedId && template.slug === "ats-classic");
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              title={template.description || template.name}
              className={`flex-1 rounded-lg border-2 bg-white p-1.5 text-left transition ${
                selected ? "border-red-500 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <TemplateThumb slug={template.slug} />
              <p className="mt-1 truncate text-center text-[10px] font-semibold text-slate-700">{template.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateThumb({ slug }: { slug: string }) {
  if (slug === "executivo") {
    return (
      <div className="flex h-14 overflow-hidden rounded border border-slate-100">
        <div className="w-1/3 space-y-0.5 bg-slate-800 p-1">
          <div className="h-1 w-3/4 rounded bg-slate-400" />
          <div className="h-0.5 w-full rounded bg-slate-600" />
          <div className="h-0.5 w-full rounded bg-slate-600" />
        </div>
        <div className="flex-1 space-y-0.5 p-1">
          <div className="h-1 w-1/2 rounded bg-slate-300" />
          <div className="h-0.5 w-full rounded bg-slate-200" />
          <div className="h-0.5 w-full rounded bg-slate-200" />
          <div className="h-0.5 w-5/6 rounded bg-slate-200" />
        </div>
      </div>
    );
  }
  if (slug === "moderno") {
    return (
      <div className="h-14 space-y-0.5 overflow-hidden rounded border border-slate-100 p-1">
        <div className="h-1.5 w-1/2 rounded bg-slate-400" />
        <div className="h-0.5 w-1/3 rounded bg-red-500" />
        <div className="mt-1 flex items-center gap-0.5">
          <div className="h-1.5 w-0.5 bg-red-500" />
          <div className="h-1 w-1/3 rounded bg-slate-300" />
        </div>
        <div className="h-0.5 w-full rounded bg-slate-200" />
        <div className="h-0.5 w-5/6 rounded bg-slate-200" />
      </div>
    );
  }
  return (
    <div className="h-14 space-y-0.5 overflow-hidden rounded border border-slate-100 p-1">
      <div className="mx-auto h-1.5 w-1/2 rounded bg-slate-400" />
      <div className="mx-auto h-0.5 w-2/3 rounded bg-slate-200" />
      <div className="mt-1 h-1 w-1/3 rounded bg-red-900/60" />
      <div className="h-0.5 w-full rounded bg-slate-200" />
      <div className="h-0.5 w-5/6 rounded bg-slate-200" />
    </div>
  );
}
