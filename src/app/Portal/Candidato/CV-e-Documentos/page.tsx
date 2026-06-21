"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw } from "@/lib/api";
import BannerError from "@/app/components/errors/BannerError";
import TagInput from "@/app/components/profile/TagInput";
import AddItemModal from "@/app/components/profile/AddItemModal";
import ExperienceCard, { type ExperienceItem } from "@/app/components/profile/ExperienceCard";
import EducationCard, { type EducationItem } from "@/app/components/profile/EducationCard";
import { normalizeParsedCvProfile } from "@/lib/cvProfile";
import { SuccessCheck } from "@/app/components/motion";

const CV_DRAFT_SESSION_KEY = "parvagas_cv_parse_draft";

type ParsedDraft = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  postcode?: string;
  nationality?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  professionalSummary?: string;
  professionalTitle?: string;
  jobTitle?: string;
  yearsOfExperience?: number | null;
  summary?: string;
  skills?: string[];
  languages?: string[];
  workExperience?: Array<{
    jobTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  experience?: Array<{
    jobTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  education?: Array<{
    degree?: string;
    institution?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  certifications?: string[];
  portfolioLinks?: string[];
  preferredJobType?: string;
  expectedSalaryAoa?: number | null;
  availability?: string;
  [key: string]: unknown;
};

type ParseResponse = {
  success?: boolean;
  parseRunId?: string;
  status?: string;
  file?: {
    id?: string | null;
    filename?: string;
    mimeType?: string;
    size?: number;
  };
  parsedProfile?: ParsedDraft;
  confidence?: Record<string, number>;
  warnings?: string[];
  profileDraft?: ParsedDraft;
  missingFields?: string[];
  parserError?: string;
  message?: string;
  error?: {
    message?: string;
  } | string;
};

type CandidateDocument = {
  _id: string;
  fileName?: string;
  type?: string;
  createdAt?: string;
  signedUrl?: string;
};

type GeneratedCvProfile = {
  _id: string;
  targetField: string;
  label?: string;
  professionalSummary?: string;
  keySkills?: string[];
  experienceHighlights?: string[];
  suggestedKeywords?: string[];
  coverLetterDraft?: string;
  approved?: boolean;
  updatedAt?: string;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PARSE_POLL_INTERVAL_MS = 2500;
const PARSE_POLL_TIMEOUT_MS = 120000;
const TARGET_FIELDS = [
  "Customer Support",
  "IT Helpdesk",
  "Frontend Developer",
  "Administration",
  "Sales",
  "Healthcare",
  "Construction",
  "Hospitality",
];

const PREFERRED_JOB_TYPE_OPTIONS = [
  { value: "tempo_integral", label: "Tempo inteiro" },
  { value: "meio_periodo", label: "Meio período" },
  { value: "contrato", label: "Contrato" },
  { value: "temporario", label: "Temporário" },
  { value: "freelancer", label: "Freelancer" },
  { value: "estagio", label: "Estágio" },
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
];

const AVAILABILITY_OPTIONS = [
  { value: "imediata", label: "Imediata" },
  { value: "1_semana", label: "1 semana" },
  { value: "2_semanas", label: "2 semanas" },
  { value: "1_mes", label: "1 mês" },
  { value: "2_meses", label: "2 meses" },
  { value: "a_combinar", label: "A combinar" },
];

const SKILL_SUGGESTIONS = ["React", "Node.js", "TypeScript", "Excel", "Power BI", "Atendimento ao cliente"];
const LANGUAGE_SUGGESTIONS = ["Português", "Inglês", "Francês", "Espanhol"];
const CERT_SUGGESTIONS = ["AWS", "Scrum", "CCNA", "Google UX", "PMI"];

const DEFAULT_EXPERIENCE: ExperienceItem = {
  jobTitle: "",
  company: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
};

const DEFAULT_EDUCATION: EducationItem = {
  degree: "",
  institution: "",
  location: "",
  startDate: "",
  endDate: "",
  description: "",
};

const toCsv = (value?: string[]) => (Array.isArray(value) ? value.join(", ") : "");
const fromCsv = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);

const normalizeMoney = (value: string) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getApiErrorMessage = (payload: ParseResponse, fallback: string) => {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (payload?.error && typeof payload.error === "object" && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
};

const reorderItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export default function CvDocumentosPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [approving, setApproving] = useState(false);
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [missingSections, setMissingSections] = useState<string[]>([]);
  const [parseWarning, setParseWarning] = useState("");
  const [parseRunId, setParseRunId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cvMappedFields, setCvMappedFields] = useState<string[]>([]);
  const [lowConfidenceFields, setLowConfidenceFields] = useState<string[]>([]);

  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [profiles, setProfiles] = useState<GeneratedCvProfile[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [targetField, setTargetField] = useState(TARGET_FIELDS[0]);
  const [jobDescription, setJobDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<GeneratedCvProfile | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const [expModalOpen, setExpModalOpen] = useState(false);
  const [eduModalOpen, setEduModalOpen] = useState(false);
  const [draftExperience, setDraftExperience] = useState<ExperienceItem>(DEFAULT_EXPERIENCE);
  const [draftEducation, setDraftEducation] = useState<EducationItem>(DEFAULT_EDUCATION);
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);
  const [editingEduIndex, setEditingEduIndex] = useState<number | null>(null);
  const [expFormError, setExpFormError] = useState("");
  const [eduFormError, setEduFormError] = useState("");

  const fieldClass = (fieldName: string) => {
    const base = "w-full rounded-xl border px-3 py-2";
    if (lowConfidenceFields.includes(fieldName)) {
      return `${base} border-amber-300 bg-amber-50`;
    }
    if (cvMappedFields.includes(fieldName)) {
      return `${base} border-blue-300 bg-blue-50`;
    }
    return `${base} border-gray-200`;
  };

  const showLowConfidence = (fieldName: string) => lowConfidenceFields.includes(fieldName);

  const latestCv = useMemo(() => documents.find((doc) => doc.type === "cv"), [documents]);

  const loadLists = useCallback(async () => {
    if (!token) return;
    setLoadingLists(true);
    try {
      const [docsData, profilesData] = await Promise.all([
        authFetch<{ documents: CandidateDocument[] }>("/candidates/cv/documents", token),
        authFetch<{ cvProfiles: GeneratedCvProfile[] }>("/candidates/cv-profiles", token),
      ]);
      setDocuments(docsData.documents || []);
      setProfiles(profilesData.cvProfiles || []);
    } catch {
      setError("Erro ao carregar documentos e perfis CV gerados.");
    } finally {
      setLoadingLists(false);
    }
  }, [token]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  const validateFile = (file: File) => {
    const allowedByMime = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedByExt = /\.(pdf|doc|docx)$/i.test(file.name || "");

    if (!allowedByExt && !allowedByMime.includes(file.type)) {
      return "Formato inválido. Use PDF, DOC ou DOCX.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "Ficheiro excede o limite de 5MB.";
    }
    return "";
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("cv", file);
      const res = await authFetchRaw("/candidates/cv/parse", token!, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as ParseResponse;
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Erro ao processar CV."));

      const parseRunId = data.parseRunId;
      if (!parseRunId) throw new Error("Nao foi possivel iniciar o processamento do CV.");

      let parsed = data;
      const startedAt = Date.now();
      while (!["completed", "failed"].includes(String(parsed.status || "").toLowerCase())) {
        if (Date.now() - startedAt > PARSE_POLL_TIMEOUT_MS) {
          throw new Error("O CV esta a ser processado em segundo plano. Recarregue em instantes para ver os dados.");
        }
        await new Promise((resolve) => setTimeout(resolve, PARSE_POLL_INTERVAL_MS));
        parsed = await authFetch<ParseResponse>(`/candidates/cv/parse/${parseRunId}`, token!, {
          suppressGlobalErrors: true,
        });
      }

      if (String(parsed.status || "").toLowerCase() === "failed") {
        throw new Error(parsed.parserError || "Erro ao processar CV.");
      }

      const nextDraft = normalizeParsedCvProfile((parsed.parsedProfile || parsed.profileDraft || {}) as Record<string, unknown>);
      setDraft(nextDraft);
      setParseRunId(parseRunId);
      setMissingSections(parsed.missingFields || []);
      setParseWarning(parsed.parserError || "");
      const mappedFields = Object.entries(nextDraft)
        .filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return value !== null && value !== undefined && String(value).trim() !== "";
        })
        .map(([key]) => key);
      setCvMappedFields(mappedFields);

      const nextLowConfidence = Object.entries(parsed.confidence || {})
        .filter(([, score]) => Number(score) > 0 && Number(score) < 0.75)
        .map(([key]) => key)
        .flatMap((key) => {
          if (key === "fullName") return ["fullName"];
          if (key === "email") return ["email"];
          if (key === "phone") return ["phone"];
          if (key === "skills") return ["skills"];
          return [key];
        });
      setLowConfidenceFields(Array.from(new Set(nextLowConfidence)));

      if (process.env.NODE_ENV !== "production") {
        console.info("[cv-parse] frontend received parsed fields", {
          parseRunId: parsed.parseRunId,
          mappedFields,
        });
      }

      setMessage("Encontrámos informação no seu CV. Reveja e confirme antes de guardar.");
      setUploadDone(true);
      // Persist draft in sessionStorage so Meu-Perfil can show the AI suggestion banner
      try {
        sessionStorage.setItem(
          CV_DRAFT_SESSION_KEY,
          JSON.stringify({
            draft: nextDraft,
            lowConfidenceFields: Array.from(new Set(nextLowConfidence)),
          })
        );
      } catch { /* ignore */ }
      await loadLists();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleApprove = async () => {
    if (!draft) return;
    const email = String(draft.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Introduza um email válido antes de guardar.");
      return;
    }
    if (
      draft.preferredJobType &&
      !PREFERRED_JOB_TYPE_OPTIONS.some((option) => option.value === draft.preferredJobType)
    ) {
      setError("Tipo de trabalho preferido inválido.");
      return;
    }
    if (
      draft.availability &&
      !AVAILABILITY_OPTIONS.some((option) => option.value === draft.availability)
    ) {
      setError("Disponibilidade inválida.");
      return;
    }
    if (
      draft.expectedSalaryAoa !== null &&
      draft.expectedSalaryAoa !== undefined &&
      !Number.isFinite(Number(draft.expectedSalaryAoa))
    ) {
      setError("Expectativa salarial deve ser numérica.");
      return;
    }
    setApproving(true);
    setError("");
    try {
      const res = await authFetchRaw("/candidates/profile/approve", token!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDraft: draft, parseRunId, consentGiven: true, cvWarnings: lowConfidenceFields }),
      });
      const data = (await res.json().catch(() => ({}))) as ParseResponse;
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Erro ao guardar perfil."));
      setDraft(null);
      setMissingSections([]);
      setParseWarning("");
      setMessage("Perfil atualizado com sucesso a partir do CV.");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>("/candidates/cv-profiles/generate", token!, {
        method: "POST",
        body: JSON.stringify({ targetField, jobDescription }),
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      setMessage("Perfil CV específico gerado. Revise antes de usar em candidaturas.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao gerar perfil CV específico.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await authFetch(`/candidates/cv-profiles/${id}`, token!, { method: "DELETE" });
      setProfiles((prev) => prev.filter((item) => item._id !== id));
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao remover perfil gerado.");
    }
  };

  const handleDuplicateProfile = async (id: string) => {
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${id}/duplicate`, token!, {
        method: "POST",
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      setMessage("Perfil CV duplicado.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao duplicar perfil CV.");
    }
  };

  const startEdit = (item: GeneratedCvProfile) => {
    setEditingId(item._id);
    setEditingDraft({ ...item });
  };

  const saveEdit = async () => {
    if (!editingId || !editingDraft) return;
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${editingId}`, token!, {
        method: "PATCH",
        body: JSON.stringify(editingDraft),
      });
      setProfiles((prev) => prev.map((item) => (item._id === editingId ? data.cvProfile : item)));
      setEditingId(null);
      setEditingDraft(null);
      setMessage("Perfil CV gerado atualizado.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao atualizar perfil gerado.");
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!token) return;
    setDeletingDocId(id);
    setError("");
    try {
      await authFetch(`/candidates/cv/documents/${id}`, token, { method: "DELETE" });
      await loadLists();
      setMessage("Documento removido com sucesso.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao remover documento.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const draftExperiences = ((draft?.experience as ParsedDraft["experience"]) || []) as ExperienceItem[];
  const draftEducationList = ((draft?.education as ParsedDraft["education"]) || []) as EducationItem[];

  const openNewExperience = () => {
    setDraftExperience(DEFAULT_EXPERIENCE);
    setEditingExpIndex(null);
    setExpFormError("");
    setExpModalOpen(true);
  };

  const openEditExperience = (index: number) => {
    setDraftExperience(draftExperiences[index] || DEFAULT_EXPERIENCE);
    setEditingExpIndex(index);
    setExpFormError("");
    setExpModalOpen(true);
  };

  const saveExperience = () => {
    if (!draftExperience.jobTitle.trim() || !draftExperience.company.trim() || !draftExperience.startDate) {
      setExpFormError("Preencha cargo, empresa e data de início.");
      return;
    }
    if (!draftExperience.current && !draftExperience.endDate) {
      setExpFormError("Preencha a data de fim ou ative experiência atual.");
      return;
    }
    if (!draft) return;
    const next = [...draftExperiences];
    if (editingExpIndex === null) next.unshift(draftExperience);
    else next[editingExpIndex] = draftExperience;
    setDraft({ ...draft, experience: next });
    setExpModalOpen(false);
  };

  const removeExperience = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, experience: draftExperiences.filter((_, i) => i !== index) });
  };

  const openNewEducation = () => {
    setDraftEducation(DEFAULT_EDUCATION);
    setEditingEduIndex(null);
    setEduFormError("");
    setEduModalOpen(true);
  };

  const openEditEducation = (index: number) => {
    setDraftEducation(draftEducationList[index] || DEFAULT_EDUCATION);
    setEditingEduIndex(index);
    setEduFormError("");
    setEduModalOpen(true);
  };

  const saveEducation = () => {
    if (!draftEducation.degree.trim() || !draftEducation.institution.trim() || !draftEducation.startDate || !draftEducation.endDate) {
      setEduFormError("Preencha curso, instituição e datas.");
      return;
    }
    if (!draft) return;
    const next = [...draftEducationList];
    if (editingEduIndex === null) next.unshift(draftEducation);
    else next[editingEduIndex] = draftEducation;
    setDraft({ ...draft, education: next });
    setEduModalOpen(false);
  };

  const removeEducation = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, education: draftEducationList.filter((_, i) => i !== index) });
  };

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">CV e Documentos</h1>
        <p className="mt-2 text-slate-600">Carregue CV, aprove dados extraídos e gere perfis específicos por área de emprego.</p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">CV principal</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{latestCv?.fileName || "Sem CV carregado"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">Documentos</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{documents.length}</p>
        </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">CV perfis gerados</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{profiles.length}</p>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-2xl border-2 border-dashed border-red-200 p-10 text-center transition-colors hover:bg-red-50"
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleUpload} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
              <p className="font-medium text-red-600">A processar CV...</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-4xl">CV</p>
              <p className="font-semibold text-gray-700">Clique para carregar CV</p>
              <p className="mt-1 text-sm text-gray-400">PDF/DOC/DOCX • max 5 MB</p>
            </>
          )}
        </div>

        {error ? (
          <div className="mt-4">
            <BannerError
              title="Não foi possível concluir a operação"
              message={error}
              actionLabel="Reconectar"
              onAction={() => {
                void loadLists();
              }}
            />
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-[var(--success-50)] px-3 py-2.5">
            {uploadDone ? <SuccessCheck size={28} tone="success" /> : null}
            <p className="text-sm font-medium text-[var(--success-700)]">{message}</p>
          </div>
        ) : null}

        {/* CV template download */}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Precisa de um modelo de CV?</p>
            <p className="mt-1 text-xs text-slate-600">
              Descarregue o nosso modelo DOCX, preencha-o e volte aqui para carregar.
            </p>
          </div>
          <a
            href="/templates/modelo-cv-parvagas.docx"
            download="modelo-cv-parvagas.docx"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/>
            </svg>
            Descarregar modelo
          </a>
        </div>

        {draft ? (
          <div className="mt-8 rounded-2xl border border-gray-100 p-6">
            <h2 className="mb-4 text-xl font-bold">Revisão dos dados extraídos</h2>
            {parseWarning ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {parseWarning}
              </p>
            ) : null}
            {missingSections.length > 0 ? (
              <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                Algumas secções vieram vazias ({missingSections.join(", ")}). Pode preencher manualmente abaixo.
              </p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Nome</span>
                <input className={fieldClass("fullName")} value={String(draft.fullName || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), fullName: e.target.value }))} />
                {showLowConfidence("fullName") ? <p className="mt-1 text-xs text-amber-700">Please check this field.</p> : null}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Email</span>
                <input className={fieldClass("email")} value={String(draft.email || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), email: e.target.value }))} />
                {showLowConfidence("email") ? <p className="mt-1 text-xs text-amber-700">Please check this field.</p> : null}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Telefone</span>
                <input className={fieldClass("phone")} value={String(draft.phone || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))} />
                {showLowConfidence("phone") ? <p className="mt-1 text-xs text-amber-700">Please check this field.</p> : null}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Título profissional</span>
                <input className={fieldClass("jobTitle")} value={String(draft.jobTitle || draft.professionalTitle || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), jobTitle: e.target.value, professionalTitle: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Localização</span>
                <input className={fieldClass("location")} value={String(draft.location || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), location: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Código postal</span>
                <input className={fieldClass("postcode")} value={String(draft.postcode || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), postcode: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Nacionalidade</span>
                <input className={fieldClass("nationality")} value={String(draft.nationality || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), nationality: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">LinkedIn</span>
                <input className={fieldClass("linkedinUrl")} value={String(draft.linkedinUrl || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), linkedinUrl: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Portfólio</span>
                <input className={fieldClass("portfolioUrl")} value={String(draft.portfolioUrl || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), portfolioUrl: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">GitHub</span>
                <input className={fieldClass("githubUrl")} value={String(draft.githubUrl || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), githubUrl: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Tipo de trabalho preferido</span>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2"
                  value={String(draft.preferredJobType || "")}
                  onChange={(e) => setDraft((prev) => ({ ...(prev || {}), preferredJobType: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {PREFERRED_JOB_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Disponibilidade</span>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2"
                  value={String(draft.availability || "")}
                  onChange={(e) => setDraft((prev) => ({ ...(prev || {}), availability: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Expectativa salarial (AOA)</span>
                <input
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2"
                  value={draft.expectedSalaryAoa ? String(draft.expectedSalaryAoa) : ""}
                  onChange={(e) => setDraft((prev) => ({ ...(prev || {}), expectedSalaryAoa: normalizeMoney(e.target.value) }))}
                />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-gray-600">Resumo</span>
              <textarea className={fieldClass("professionalSummary")} rows={4} value={String(draft.professionalSummary || draft.summary || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), professionalSummary: e.target.value, summary: e.target.value }))} />
            </label>

            <div className="mt-4 space-y-4">
              <TagInput
                label="Skills"
                placeholder="Ex.: React"
                values={(draft.skills as string[]) || []}
                onChange={(next) => setDraft((prev) => ({ ...(prev || {}), skills: next }))}
                suggestions={SKILL_SUGGESTIONS}
              />
              <TagInput
                label="Idiomas"
                placeholder="Ex.: Português"
                values={(draft.languages as string[]) || []}
                onChange={(next) => setDraft((prev) => ({ ...(prev || {}), languages: next }))}
                suggestions={LANGUAGE_SUGGESTIONS}
              />
              <TagInput
                label="Certificações"
                placeholder="Ex.: AWS"
                values={(draft.certifications as string[]) || []}
                onChange={(next) => setDraft((prev) => ({ ...(prev || {}), certifications: next }))}
                suggestions={CERT_SUGGESTIONS}
              />
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Experiência profissional</h3>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                  onClick={openNewExperience}
                >
                  Adicionar experiência
                </button>
              </div>
              {draftExperiences.length === 0 ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Sem experiências extraídas.</p> : null}
              <div className="space-y-3">
                {draftExperiences.map((item, index) => (
                  <ExperienceCard
                    key={`${item.jobTitle}-${index}`}
                    item={item}
                    onEdit={() => openEditExperience(index)}
                    onDelete={() => removeExperience(index)}
                    onMoveUp={index > 0 ? () => setDraft((prev) => ({ ...(prev || {}), experience: reorderItem(((prev?.experience as ExperienceItem[]) || []), index, index - 1) })) : undefined}
                    onMoveDown={index < draftExperiences.length - 1 ? () => setDraft((prev) => ({ ...(prev || {}), experience: reorderItem(((prev?.experience as ExperienceItem[]) || []), index, index + 1) })) : undefined}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Educação</h3>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                  onClick={openNewEducation}
                >
                  Adicionar educação
                </button>
              </div>
              {draftEducationList.length === 0 ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Sem registos de educação extraídos.</p> : null}
              <div className="space-y-3">
                {draftEducationList.map((item, index) => (
                  <EducationCard
                    key={`${item.degree}-${index}`}
                    item={item}
                    onEdit={() => openEditEducation(index)}
                    onDelete={() => removeEducation(index)}
                    onMoveUp={index > 0 ? () => setDraft((prev) => ({ ...(prev || {}), education: reorderItem(((prev?.education as EducationItem[]) || []), index, index - 1) })) : undefined}
                    onMoveDown={index < draftEducationList.length - 1 ? () => setDraft((prev) => ({ ...(prev || {}), education: reorderItem(((prev?.education as EducationItem[]) || []), index, index + 1) })) : undefined}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button onClick={handleApprove} disabled={approving} className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {approving ? "A guardar..." : "Confirmar e guardar"}
              </button>
              <button onClick={() => { setDraft(null); setMissingSections([]); setParseWarning(""); }} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <section className="mt-10 rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-bold">Gerar CV por área de emprego</h2>
          <p className="mt-1 text-sm text-gray-500">Gere versões especializadas sem sobrescrever o perfil principal.</p>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleGenerate}>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Área alvo</span>
              <select className="w-full rounded-xl border border-gray-200 px-3 py-2" value={targetField} onChange={(e) => setTargetField(e.target.value)}>
                {TARGET_FIELDS.map((field) => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">Descrição da vaga (opcional)</span>
              <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </label>
            <div>
              <button type="submit" disabled={generating} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {generating ? "A gerar..." : "Gerar perfil CV"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Perfis CV gerados</h2>
          {loadingLists ? <p className="text-sm text-gray-500">A carregar...</p> : null}
          {!loadingLists && profiles.length === 0 ? <p className="text-sm text-gray-500">Ainda não existem perfis CV gerados.</p> : null}
          <div className="space-y-4">
            {profiles.map((item) => {
              const editing = editingId === item._id && editingDraft;
              return (
                <article key={item._id} className="rounded-2xl border border-gray-100 p-4">
                  {!editing ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{item.label || item.targetField}</p>
                          <p className="text-xs text-gray-500">Área: {item.targetField}</p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button className="rounded border px-2 py-1" onClick={() => startEdit(item)}>Editar</button>
                          <button className="rounded border px-2 py-1" onClick={() => handleDuplicateProfile(item._id)}>Duplicar</button>
                          <button className="rounded border px-2 py-1 text-red-600" onClick={() => handleDeleteProfile(item._id)}>Eliminar</button>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-gray-700">{item.professionalSummary || "Sem resumo."}</p>
                      <p className="mt-2 text-xs text-gray-500">Keywords: {(item.suggestedKeywords || []).slice(0, 8).join(", ") || "N/A"}</p>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block text-gray-600">Resumo profissional</span>
                        <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.professionalSummary || ""} onChange={(e) => setEditingDraft({ ...editingDraft, professionalSummary: e.target.value })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Key skills (vírgula)</span>
                        <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.keySkills)} onChange={(e) => setEditingDraft({ ...editingDraft, keySkills: fromCsv(e.target.value) })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Suggested keywords (vírgula)</span>
                        <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.suggestedKeywords)} onChange={(e) => setEditingDraft({ ...editingDraft, suggestedKeywords: fromCsv(e.target.value) })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Cover letter draft</span>
                        <textarea rows={4} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.coverLetterDraft || ""} onChange={(e) => setEditingDraft({ ...editingDraft, coverLetterDraft: e.target.value })} />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" onClick={saveEdit}>Guardar</button>
                        <button className="rounded border px-3 py-1.5 text-xs" onClick={() => { setEditingId(null); setEditingDraft(null); }}>Cancelar</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Documentos</h2>
          {documents.length === 0 ? <p className="text-sm text-gray-500">Sem documentos carregados.</p> : null}
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3 text-sm">
                <div>
                  <p className="font-medium">{doc.fileName || "Documento"}</p>
                  <p className="text-xs text-gray-500">{doc.type || "file"} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-AO") : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">Abrir</a> : null}
                  <button
                    type="button"
                    disabled={deletingDocId === doc._id}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    onClick={() => handleDeleteDocument(doc._id)}
                  >
                    {deletingDocId === doc._id ? "A remover..." : "Eliminar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

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
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição" value={draftExperience.description} onChange={(e) => setDraftExperience((prev) => ({ ...prev, description: e.target.value }))} />
        {expFormError ? <p className="mt-2 text-xs text-rose-700">{expFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setExpModalOpen(false)}>Cancelar</button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={saveExperience}>Guardar</button>
        </div>
      </AddItemModal>

      <AddItemModal
        open={eduModalOpen}
        title={editingEduIndex === null ? "Adicionar educação" : "Editar educação"}
        onClose={() => setEduModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Curso/Grau" value={draftEducation.degree} onChange={(e) => setDraftEducation((prev) => ({ ...prev, degree: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Instituição" value={draftEducation.institution} onChange={(e) => setDraftEducation((prev) => ({ ...prev, institution: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Local" value={draftEducation.location} onChange={(e) => setDraftEducation((prev) => ({ ...prev, location: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.startDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.endDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, endDate: e.target.value }))} />
        </div>
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição" value={draftEducation.description} onChange={(e) => setDraftEducation((prev) => ({ ...prev, description: e.target.value }))} />
        {eduFormError ? <p className="mt-2 text-xs text-rose-700">{eduFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEduModalOpen(false)}>Cancelar</button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={saveEducation}>Guardar</button>
        </div>
      </AddItemModal>
    </div>
  );
}
