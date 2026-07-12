"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type AutoApplyProposal = {
  _id: string;
  jobId: string;
  job?: {
    _id: string;
    title?: string;
    location?: string;
    workMode?: string;
    companyId?: { name?: string } | string;
  } | null;
  matchScore: number;
  matchReasons: string[];
  status: string;
  createdAt?: string;
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

const JOB_CATEGORIES = [
  "Tecnologia",
  "Energia",
  "Saude",
  "Banca e Financas",
  "Logistica",
  "Recursos Humanos",
  "Comercial",
];

const categoryLabels: Record<string, string> = {
  Tecnologia: "Tecnologia",
  Energia: "Energia",
  Saude: "Saúde",
  "Banca e Financas": "Banca e Finanças",
  Logistica: "Logística",
  "Recursos Humanos": "Recursos Humanos",
  Comercial: "Comercial",
};

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

// ── CV Builder subscription plan banner ─────────────────────────────────────

type CVPlan = {
  tier: string;
  name: string;
  price: number;
  features: string[];
};

type CVSubResponse = {
  subscription: {
    tier: string;
    status: string;
    plan: CVPlan;
    currentPeriodEnd?: string | null;
  };
};

type CVPlansResponse = { plans: CVPlan[] };

function CVBuilderPlanBanner({ token }: { token: string | null }) {
  const [sub, setSub] = useState<CVSubResponse["subscription"] | null>(null);
  const [plans, setPlans] = useState<CVPlan[]>([]);
  const [open, setOpen] = useState(false);
  const [subscribing, setSubscribing] = useState("");
  const [provider, setProvider] = useState("multicaixa");
  const [instructions, setInstructions] = useState<{ message: string; reference: string } | null>(null);

  useEffect(() => {
    authFetch<CVPlansResponse>("/cv-builder/plans", "").catch(() => null).then((r) => setPlans(r?.plans || []));
    if (!token) return;
    authFetch<CVSubResponse>("/cv-builder/subscription", token).catch(() => null).then((r) => {
      if (r?.subscription) setSub(r.subscription);
    });
  }, [token]);

  const currentTier = sub?.tier ?? "free";

  const handleSubscribe = async (tier: string) => {
    if (!token) return;
    setSubscribing(tier);
    setInstructions(null);
    try {
      const res = await authFetch<{ activated?: boolean; instructions?: { message: string; reference: string } }>(
        "/cv-builder/subscribe",
        token,
        { method: "POST", body: JSON.stringify({ tier, provider }) },
      );
      if (res.activated) {
        setSub((prev) => ({ ...(prev ?? { tier, status: "active", plan: plans.find((p) => p.tier === tier) ?? { tier, name: tier, price: 0, features: [] } }), tier, status: "active" }));
        setOpen(false);
      } else if (res.instructions) {
        setInstructions(res.instructions);
      }
    } catch {
      /* handled by global notifier */
    } finally {
      setSubscribing("");
    }
  };

  if (currentTier !== "free" && sub?.status === "active") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <span className="text-green-700 text-lg">✓</span>
        <div>
          <p className="text-sm font-semibold text-green-800">Plano {sub.plan?.name ?? currentTier} ativo</p>
          {sub.currentPeriodEnd && (
            <p className="text-xs text-green-600">Válido até {new Date(sub.currentPeriodEnd).toLocaleDateString("pt-PT")}</p>
          )}
        </div>
        <button type="button" onClick={() => setOpen(true)} className="ml-auto text-xs text-green-700 underline">
          Gerir plano
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="mt-0.5 text-amber-600 text-lg">⭐</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Desbloqueie o Construtor de CV completo</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Plano Pro (15 000 AOA/mês) — 3 CVs, pontuação IA, export DOCX/PDF, cartas de apresentação.
            Plano Premium (30 000 AOA/mês) — tudo ilimitado + candidatura automática.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Ver planos
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Planos CV Builder</h2>
              <button type="button" onClick={() => { setOpen(false); setInstructions(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {instructions ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Instruções de pagamento</p>
                <p className="mt-2 text-sm text-blue-800">{instructions.message}</p>
                <p className="mt-1 text-xs text-blue-600">Referência: <strong>{instructions.reference}</strong></p>
                <p className="mt-2 text-xs text-blue-600">O plano ativa automaticamente após confirmação do pagamento pelo administrador.</p>
                <button type="button" onClick={() => { setOpen(false); setInstructions(null); }} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método de pagamento</label>
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="multicaixa">Multicaixa Express</option>
                    <option value="unitel_money">Unitel Money</option>
                    <option value="bank">Transferência bancária</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={plan.tier}
                      className={`rounded-xl border p-4 flex flex-col gap-3 ${plan.tier === currentTier ? "border-red-300 bg-red-50" : "border-slate-200"}`}
                    >
                      <div>
                        <p className="font-bold text-slate-900">{plan.name}</p>
                        <p className="text-xl font-bold text-red-600 mt-1">
                          {plan.price === 0 ? "Grátis" : `${plan.price.toLocaleString("pt-PT")} AOA`}
                          {plan.price > 0 && <span className="text-xs font-normal text-slate-500">/mês</span>}
                        </p>
                      </div>
                      <ul className="space-y-1 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="text-green-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={plan.tier === currentTier || subscribing === plan.tier}
                        onClick={() => handleSubscribe(plan.tier)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          plan.tier === currentTier
                            ? "bg-slate-100 text-slate-400 cursor-default"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }`}
                      >
                        {plan.tier === currentTier ? "Plano atual" : subscribing === plan.tier ? "A processar…" : plan.price === 0 ? "Selecionar grátis" : "Subscrever"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function CvDocumentosPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const router = useRouter();
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

  const [exporting, setExporting] = useState<string | null>(null);
  const [targetJobId, setTargetJobId] = useState("");
  const [savedJobOptions, setSavedJobOptions] = useState<{ id: string; title: string }[]>([]);

  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [autoApplyOptIn, setAutoApplyOptIn] = useState(false);
  const [savingAutoApply, setSavingAutoApply] = useState(false);
  const [autoApplyMsg, setAutoApplyMsg] = useState("");

  const [proposals, setProposals] = useState<AutoApplyProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    if (!token) return;
    setLoadingProposals(true);
    try {
      const data = await authFetch<{ proposals: AutoApplyProposal[] }>("/candidates/auto-apply/proposals?status=pending", token);
      setProposals(data.proposals || []);
    } catch {
      // Non-critical — the rest of the page still works without this list.
    } finally {
      setLoadingProposals(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    authFetch<{ profile: { preferredJobCategories?: string[]; autoApplyOptIn?: boolean } }>("/candidates/profile", token)
      .then((d) => {
        setPreferredCategories(d.profile?.preferredJobCategories || []);
        setAutoApplyOptIn(Boolean(d.profile?.autoApplyOptIn));
      })
      .catch(() => {});
    loadProposals();
    authFetch<{ jobs: { job?: { _id: string; title?: string } }[] }>("/candidates/jobs/saved?page=1&limit=20", token)
      .then((d) => {
        const options = (d.jobs || [])
          .filter((item): item is { job: { _id: string; title?: string } } => Boolean(item.job?._id))
          .map((item) => ({ id: item.job._id, title: item.job.title || "Vaga" }));
        setSavedJobOptions(options);
      })
      .catch(() => {});
  }, [token, loadProposals]);

  const toggleCategory = (category: string) => {
    setPreferredCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const saveAutoApplyPrefs = async (nextCategories: string[], nextOptIn: boolean) => {
    setSavingAutoApply(true);
    setAutoApplyMsg("");
    try {
      await authFetch("/candidates/profile", token!, {
        method: "PATCH",
        body: JSON.stringify({ preferredJobCategories: nextCategories, autoApplyOptIn: nextOptIn }),
      });
      setAutoApplyMsg("Preferências de área guardadas.");
    } catch (err: unknown) {
      setAutoApplyMsg((err as Error).message || "Erro ao guardar preferências de área.");
    } finally {
      setSavingAutoApply(false);
    }
  };

  const reviewProposal = async (proposalId: string, action: "approve" | "dismiss") => {
    setReviewingId(proposalId);
    setAutoApplyMsg("");
    try {
      await authFetch(`/candidates/auto-apply/proposals/${proposalId}/${action}`, token!, { method: "POST" });
      setProposals((prev) => prev.filter((p) => p._id !== proposalId));
      setAutoApplyMsg(action === "approve" ? "Candidatura submetida com sucesso." : "Sugestão dispensada.");
    } catch (err: unknown) {
      setAutoApplyMsg((err as Error).message || "Erro ao rever a sugestão.");
    } finally {
      setReviewingId(null);
    }
  };

  const openCvBuilder = () => {
    router.push("/Portal/Candidato/Construtor-CV");
  };

  const handleExport = async (format: "pdf" | "docx" | "json") => {
    if (!token) return;
    setExporting(format);
    setError("");
    try {
      const jobParam = targetJobId ? `&targetJobId=${encodeURIComponent(targetJobId)}` : "";
      const res = await authFetchRaw(`/candidates/cv/export?format=${format}${jobParam}`, token);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Erro ao exportar CV.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cv.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao exportar CV.");
    } finally {
      setExporting(null);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<GeneratedCvProfile | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

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
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/tiff",
      "image/bmp",
    ];
    const allowedByExt = /\.(pdf|doc|docx|png|jpe?g|webp|tiff?|bmp)$/i.test(file.name || "");

    if (!allowedByExt && !allowedByMime.includes(file.type)) {
      return "Formato inválido. Use PDF, DOC, DOCX ou imagem (PNG/JPG).";
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

  const toggleDocSelected = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allDocsSelected = documents.length > 0 && documents.every((doc) => selectedDocIds.has(doc._id));

  const toggleSelectAllDocs = () => {
    setSelectedDocIds((prev) => (prev.size === documents.length ? new Set() : new Set(documents.map((d) => d._id))));
  };

  const performDeleteDocuments = async (ids: string[]) => {
    if (!token || ids.length === 0) return;
    setDeletingBatch(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        ids.map((id) => authFetch(`/candidates/cv/documents/${id}`, token, { method: "DELETE" }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedDocIds(new Set());
      setConfirmDeleteIds(null);
      await loadLists();
      if (failed > 0) {
        setError(`Não foi possível remover ${failed} de ${ids.length} documento(s). Tente novamente.`);
      } else {
        setMessage(ids.length > 1 ? `${ids.length} documentos removidos com sucesso.` : "Documento removido com sucesso.");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao remover documento(s).");
    } finally {
      setDeletingBatch(false);
    }
  };

  const confirmDocNames = confirmDeleteIds
    ? documents.filter((d) => confirmDeleteIds.includes(d._id)).map((d) => d.fileName || "Documento")
    : [];

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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">CV e Documentos</h1>
          <p className="mt-2 text-slate-600">Carregue CV, aprove dados extraídos e gere perfis específicos por área de emprego.</p>
        </div>
        {/* ── CV Builder launch button ── */}
        <button
          type="button"
          onClick={openCvBuilder}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Construtor de CV
        </button>
      </div>

      {/* ── CV Builder subscription plan banner ── */}
      <CVBuilderPlanBanner token={token} />

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

        {/* Auto-apply: precise multi-signal matching, candidate always approves before submission */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Candidatura automática por área</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Escolha as áreas de emprego do seu interesse. Vamos analisar vagas novas nessas áreas — comparando
                competências, experiência, salário e localização com o seu perfil — e sugerir-lhe as mais compatíveis
                abaixo. <strong>Nenhuma candidatura é submetida sem a sua aprovação.</strong>
              </p>
              <p className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                🚀 Funcionalidade paga (em breve). Por agora, revê e aprova sugestões gratuitamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !autoApplyOptIn;
                setAutoApplyOptIn(next);
                saveAutoApplyPrefs(preferredCategories, next);
              }}
              disabled={savingAutoApply}
              aria-label="Activar candidatura automática (preferência)"
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${autoApplyOptIn ? "bg-red-600" : "bg-slate-200"}`}
            >
              <span className={`m-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${autoApplyOptIn ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {JOB_CATEGORIES.map((category) => {
              const selected = preferredCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {categoryLabels[category] || category}
                </button>
              );
            })}
          </div>

          {autoApplyMsg ? (
            <p className={`mt-3 text-sm ${autoApplyMsg.toLowerCase().includes("erro") ? "text-red-600" : "text-green-600"}`}>{autoApplyMsg}</p>
          ) : null}

          <button
            type="button"
            onClick={() => saveAutoApplyPrefs(preferredCategories, autoApplyOptIn)}
            disabled={savingAutoApply}
            className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            {savingAutoApply ? "A guardar..." : "Guardar áreas de interesse"}
          </button>

          {autoApplyOptIn && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-slate-900">Sugestões de candidatura para rever</h3>
              {loadingProposals ? (
                <p className="mt-2 text-sm text-slate-500">A carregar sugestões...</p>
              ) : proposals.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  Sem sugestões de momento. Verificamos vagas novas nas suas áreas periodicamente.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {proposals.map((proposal) => {
                    const company =
                      proposal.job?.companyId && typeof proposal.job.companyId === "object"
                        ? proposal.job.companyId.name
                        : "Empresa";
                    const busy = reviewingId === proposal._id;
                    return (
                      <article key={proposal._id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{proposal.job?.title || "Vaga"}</p>
                            <p className="text-xs text-slate-500">
                              {company} {proposal.job?.location ? `• ${proposal.job.location}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                            {proposal.matchScore}% compatível
                          </span>
                        </div>
                        {proposal.matchReasons?.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                            {proposal.matchReasons.map((reason, i) => (
                              <li key={i}>• {reason}</li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => reviewProposal(proposal._id, "approve")}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {busy ? "A processar..." : "Aprovar e candidatar"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => reviewProposal(proposal._id, "dismiss")}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Dispensar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="cursor-pointer rounded-2xl border-2 border-dashed border-red-200 p-10 text-center transition-colors hover:bg-red-50"
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.tiff,.bmp" className="hidden" onChange={handleUpload} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
              <p className="font-medium text-red-600">A processar CV...</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-4xl">CV</p>
              <p className="font-semibold text-gray-700">Clique para carregar CV</p>
              <p className="mt-1 text-sm text-gray-500">PDF/DOC/DOCX • max 5 MB</p>
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

        {/* Export current profile */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Exportar perfil como CV</p>
              <p className="mt-1 text-xs text-slate-600">
                Descarregue o seu perfil guardado como CV formatado.
              </p>
              <label className="mt-3 block text-xs text-slate-600">
                Adaptar para uma vaga guardada (opcional)
                <select
                  className="mt-1 block w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                  value={targetJobId}
                  onChange={(e) => setTargetJobId(e.target.value)}
                >
                  <option value="">CV genérico (sem vaga alvo)</option>
                  {savedJobOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.title}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["pdf", "docx", "json"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleExport(fmt)}
                  disabled={!!exporting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {exporting === fmt ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
                    </svg>
                  )}
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </section>

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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Documentos</h2>
            {documents.length > 0 ? (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    checked={allDocsSelected}
                    onChange={toggleSelectAllDocs}
                  />
                  Selecionar todos
                </label>
                <button
                  type="button"
                  disabled={selectedDocIds.size === 0}
                  onClick={() => setConfirmDeleteIds(Array.from(selectedDocIds))}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Eliminar selecionados{selectedDocIds.size > 0 ? ` (${selectedDocIds.size})` : ""}
                </button>
              </div>
            ) : null}
          </div>
          {documents.length === 0 ? <p className="text-sm text-gray-500">Sem documentos carregados.</p> : null}
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${doc.fileName || "documento"}`}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    checked={selectedDocIds.has(doc._id)}
                    onChange={() => toggleDocSelected(doc._id)}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.fileName || "Documento"}</p>
                    <p className="text-xs text-gray-500">{doc.type || "file"} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-AO") : ""}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">Abrir</a> : null}
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    onClick={() => setConfirmDeleteIds([doc._id])}
                  >
                    Eliminar
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
        open={confirmDeleteIds !== null}
        title={confirmDocNames.length > 1 ? "Eliminar documentos" : "Eliminar documento"}
        onClose={() => { if (!deletingBatch) setConfirmDeleteIds(null); }}
      >
        <p className="text-sm text-slate-700">
          {confirmDocNames.length > 1
            ? `Tem a certeza que pretende eliminar ${confirmDocNames.length} documentos? Esta ação é permanente e não pode ser anulada.`
            : "Tem a certeza que pretende eliminar este documento? Esta ação é permanente e não pode ser anulada."}
        </p>
        {confirmDocNames.length > 0 ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {confirmDocNames.map((name, i) => (
              <li key={`${name}-${i}`} className="truncate">• {name}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={deletingBatch}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={() => setConfirmDeleteIds(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={deletingBatch}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            onClick={() => performDeleteDocuments(confirmDeleteIds || [])}
          >
            {deletingBatch ? "A remover..." : "Eliminar"}
          </button>
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
