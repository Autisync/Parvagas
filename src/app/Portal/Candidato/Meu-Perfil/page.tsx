"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, authFetch, getErrorMessage } from "@/lib/api";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import ProfileCompletionCard from "@/app/components/ProfileCompletionCard";
import { SparklesIcon, XMarkIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useAppNotifier } from "@/app/components/AppNotifier";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import SectionContainer from "@/app/components/profile/SectionContainer";
import TagInput from "@/app/components/profile/TagInput";
import AddItemModal from "@/app/components/profile/AddItemModal";
import ExperienceCard, { type ExperienceItem } from "@/app/components/profile/ExperienceCard";
import EducationCard, { type EducationItem } from "@/app/components/profile/EducationCard";

const CV_DRAFT_SESSION_KEY = "parvagas_cv_parse_draft";

type Profile = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  professionalTitle?: string;
  summary?: string;
  professionalSummary?: string;
  bio?: string;
  skills?: string[];
  languages?: string[];
  experience?: ExperienceItem[];
  education?: EducationItem[];
  certifications?: string[];
  portfolioLinks?: string[];
  preferredJobType?: string;
  expectedSalaryAoa?: number | null;
  availability?: string;
};

type SummaryDraftResponse = {
  draft?: string;
  warning?: string;
};

type ProfileResponse = {
  profile?: Profile;
  latestCvDocument?: { _id: string; fileName?: string } | null;
};

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

const SKILL_SUGGESTIONS = ["React", "Node.js", "TypeScript", "JavaScript", "UX", "Figma", "SQL", "Excel", "Power BI", "Atendimento ao cliente"];

const CERT_SUGGESTIONS = ["Google UX", "AWS Cloud Practitioner", "Scrum Foundation", "Meta Front-End", "PMI", "Cisco CCNA"];
const LANGUAGE_SUGGESTIONS = ["Português", "Inglês", "Francês", "Espanhol"];

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

function normalizeExperience(item: Record<string, unknown>): ExperienceItem {
  return {
    jobTitle: String(item.jobTitle || item.title || "").trim(),
    company: String(item.company || "").trim(),
    location: String(item.location || "").trim(),
    startDate: String(item.startDate || ""),
    endDate: String(item.endDate || ""),
    current: Boolean(item.current || item.endDate === ""),
    description: String(item.description || "").trim(),
  };
}

function normalizeEducation(item: Record<string, unknown>): EducationItem {
  return {
    degree: String(item.degree || item.course || "").trim(),
    institution: String(item.institution || item.school || "").trim(),
    location: String(item.location || "").trim(),
    startDate: String(item.startDate || ""),
    endDate: String(item.endDate || ""),
    description: String(item.description || "").trim(),
  };
}

function parseArray<T>(raw: unknown, parser: (item: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => parser(item as Record<string, unknown>));
}

function reorderItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function parseExpectedSalary(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyInput(value: number | null | undefined): string {
  if (!value || value <= 0) return "";
  return new Intl.NumberFormat("pt-PT").format(value);
}

export default function MeuPerfilPage() {
  const router = useRouter();
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [profile, setProfile] = useState<Profile>({});
  const [salaryInput, setSalaryInput] = useState("");
  const [latestCvName, setLatestCvName] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [openSection, setOpenSection] = useState("informacao");
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [eduModalOpen, setEduModalOpen] = useState(false);
  const [draftExperience, setDraftExperience] = useState<ExperienceItem>(DEFAULT_EXPERIENCE);
  const [draftEducation, setDraftEducation] = useState<EducationItem>(DEFAULT_EDUCATION);
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);
  const [editingEduIndex, setEditingEduIndex] = useState<number | null>(null);
  const [expFormError, setExpFormError] = useState("");
  const [eduFormError, setEduFormError] = useState("");
  const [summaryPreview, setSummaryPreview] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryWarning, setSummaryWarning] = useState("Revise sempre o texto antes de guardar.");
  // AI autofill suggestion banner (populated from sessionStorage after CV parse)
  const [cvParseDraft, setCvParseDraft] = useState<Profile | null>(null);
  const [cvDraftDismissed, setCvDraftDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { notify } = useAppNotifier();

  // Load CV parse draft from sessionStorage (set by CV-e-Documentos after upload)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(CV_DRAFT_SESSION_KEY);
      if (raw) setCvParseDraft(JSON.parse(raw) as Profile);
    } catch {
      /* ignore */
    }
  }, []);

  const loadProfile = useCallback(() => {
    if (!token) return;
    setFetching(true);
    setFetchError("");
    authFetch<ProfileResponse>("/candidates/profile", token)
      .then((d) => {
        const incomingProfile = d.profile || {};
        setProfile({
          ...incomingProfile,
          professionalSummary: String(incomingProfile.professionalSummary || incomingProfile.summary || "").trim(),
          summary: String(incomingProfile.summary || incomingProfile.professionalSummary || "").trim(),
          expectedSalaryAoa: parseExpectedSalary(incomingProfile.expectedSalaryAoa),
          experience: parseArray(incomingProfile.experience, normalizeExperience),
          education: parseArray(incomingProfile.education, normalizeEducation),
          skills: Array.isArray(incomingProfile.skills) ? incomingProfile.skills : [],
          languages: Array.isArray(incomingProfile.languages) ? incomingProfile.languages : [],
          certifications: Array.isArray(incomingProfile.certifications) ? incomingProfile.certifications : [],
          portfolioLinks: Array.isArray(incomingProfile.portfolioLinks) ? incomingProfile.portfolioLinks : [],
        });
        setSalaryInput(formatCurrencyInput(parseExpectedSalary(incomingProfile.expectedSalaryAoa)));
        setLatestCvName(d.latestCvDocument?.fileName || "");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error && error.message ? error.message : "Erro ao carregar perfil.";
        setFetchError(message);
      })
      .finally(() => setFetching(false));
  }, [token]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("sucesso") ? "success" : "error");
    setMessage("");
  }, [message, notify]);

  const completion = useMemo(() => {
    const checks = [
      [profile.fullName, profile.email, profile.phone, profile.location].every((v) => String(v || "").trim()),
      String(profile.professionalTitle || "").trim().length > 0,
      String(profile.summary || "").trim().length >= 120,
      (profile.skills || []).length > 0,
      (profile.languages || []).length > 0,
      (profile.experience || []).length > 0,
      (profile.education || []).length > 0,
      Boolean(latestCvName),
      Boolean(profile.preferredJobType) && profile.expectedSalaryAoa !== null && profile.expectedSalaryAoa !== undefined,
      Boolean(profile.availability),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [latestCvName, profile]);

  const progressChecklist = useMemo(() => {
    const hasPersonal = [profile.fullName, profile.email, profile.phone, profile.location].every((v) => String(v || "").trim());
    const hasSkills = (profile.skills || []).length >= 3;
    const hasExperience = (profile.experience || []).length >= 2;
    const hasEducation = (profile.education || []).length >= 1;
    const hasSummary = String(profile.summary || "").trim().length >= 120;
    const hasPreferences = Boolean(profile.preferredJobType) && (profile.expectedSalaryAoa || 0) > 0;
    return [
      { label: "Informação pessoal", done: hasPersonal },
      { label: "Título profissional", done: String(profile.professionalTitle || "").trim().length > 0 },
      { label: "Resumo", done: hasSummary },
      { label: "Skills", done: hasSkills },
      { label: "Idiomas", done: (profile.languages || []).length > 0 },
      { label: "Experiência", done: hasExperience },
      { label: "Educação", done: hasEducation },
      { label: "CV carregado", done: Boolean(latestCvName) },
      { label: "Preferências", done: hasPreferences },
      { label: "Disponibilidade", done: Boolean(profile.availability) },
    ];
  }, [latestCvName, profile]);

  const actionableHint = useMemo(() => {
    if ((profile.experience || []).length < 2) return "Adicione pelo menos 2 experiências para melhorar a sua visibilidade.";
    if ((profile.skills || []).length < 5) return "Adicione mais skills relevantes para aparecer em mais pesquisas.";
    if (String(profile.summary || "").trim().length < 150) return "Escreva um resumo entre 150 e 300 caracteres para destacar o seu perfil.";
    if (!latestCvName) return "Carregue um CV atualizado para completar melhor o seu perfil.";
    return "Bom trabalho. Continue a atualizar o perfil com informação recente.";
  }, [latestCvName, profile]);

  const sectionState = {
    informacao: [profile.fullName, profile.email, profile.phone, profile.location].every((v) => String(v || "").trim())
      ? "complete"
      : [profile.fullName, profile.email, profile.phone, profile.location].some((v) => String(v || "").trim())
        ? "partial"
        : "empty",
    experiencia: (profile.experience || []).length >= 2 ? "complete" : (profile.experience || []).length > 0 ? "partial" : "empty",
    educacao: (profile.education || []).length >= 1 ? "complete" : "empty",
    skills: (profile.skills || []).length >= 5 ? "complete" : (profile.skills || []).length > 0 ? "partial" : "empty",
    certificacoes: (profile.certifications || []).length >= 1 ? "complete" : "empty",
    idiomas: (profile.languages || []).length >= 1 ? "complete" : "empty",
    resumo: String(profile.summary || "").trim().length >= 150 ? "complete" : String(profile.summary || "").trim() ? "partial" : "empty",
  } as const;

  const validateForm = () => {
    // Format-only validation — do NOT block on empty fields.
    // Users can save partial profiles at any time.
    const nextErrors: Record<string, string> = {};
    if (profile.email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(profile.email).trim())) {
      nextErrors.email = "Introduza um email válido.";
    }
    if (profile.phone && !/^\+?[\d\s()\-]{7,20}$/.test(profile.phone)) {
      nextErrors.phone = "Telefone inválido";
    }
    if (profile.preferredJobType && !PREFERRED_JOB_TYPE_OPTIONS.map((o) => o.value).includes(profile.preferredJobType)) {
      nextErrors.preferredJobType = "Selecione uma opção válida";
    }
    if (profile.availability && !AVAILABILITY_OPTIONS.map((o) => o.value).includes(profile.availability)) {
      nextErrors.availability = "Selecione uma opção válida";
    }
    if (profile.expectedSalaryAoa !== null && profile.expectedSalaryAoa !== undefined && profile.expectedSalaryAoa < 0) {
      nextErrors.expectedSalaryAoa = "O valor deve ser positivo.";
    }
    if ((profile.skills || []).some((item) => item.trim().length < 2 || item.trim().length > 40)) {
      nextErrors.skills = "Cada skill deve ter entre 2 e 40 caracteres.";
    }
    if ((profile.experience || []).some((item) => item.endDate && item.startDate && item.endDate < item.startDate)) {
      nextErrors.experience = "As datas da experiência são inválidas.";
    }
    if ((profile.experience || []).some((item) => !item.jobTitle.trim() || !item.company.trim() || !item.startDate || (!item.current && !item.endDate))) {
      nextErrors.experience = "Complete cargo, empresa e datas em cada experiência.";
    }
    if ((profile.education || []).some((item) => item.endDate && item.startDate && item.endDate < item.startDate)) {
      nextErrors.education = "As datas da educação são inválidas.";
    }
    if ((profile.education || []).some((item) => !item.degree.trim() || !item.institution.trim() || !item.startDate || !item.endDate)) {
      nextErrors.education = "Complete curso, instituição e datas em cada formação.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Jump to first section that isn't complete
  const goToFirstIncomplete = useCallback(() => {
    const order = ["informacao", "experiencia", "educacao", "skills", "idiomas", "resumo"];
    const firstBad = order.find((id) => {
      if (id === "informacao") return sectionState.informacao !== "complete";
      if (id === "experiencia") return sectionState.experiencia !== "complete";
      if (id === "educacao") return sectionState.educacao !== "complete";
      if (id === "skills") return sectionState.skills !== "complete";
      if (id === "idiomas") return sectionState.idiomas !== "complete";
      if (id === "resumo") return sectionState.resumo !== "complete";
      return false;
    });
    if (!firstBad) return;
    setOpenSection(firstBad);
    setTimeout(() => {
      const el = document.getElementById(`section-${firstBad}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [sectionState]);

  const applyAiDraft = useCallback(() => {
    if (!cvParseDraft) return;
    setProfile((prev) => ({
      ...prev,
      ...cvParseDraft,
      // Never overwrite data the user has already set
      fullName: prev.fullName || cvParseDraft.fullName,
      email: prev.email || cvParseDraft.email,
      phone: prev.phone || cvParseDraft.phone,
      location: prev.location || cvParseDraft.location,
      professionalTitle: prev.professionalTitle || cvParseDraft.professionalTitle,
      summary: prev.summary || cvParseDraft.summary,
      professionalSummary: prev.professionalSummary || cvParseDraft.professionalSummary || cvParseDraft.summary,
      skills: (prev.skills || []).length > 0 ? prev.skills : cvParseDraft.skills,
      languages: (prev.languages || []).length > 0 ? prev.languages : cvParseDraft.languages,
      experience: (prev.experience || []).length > 0 ? prev.experience : cvParseDraft.experience,
      education: (prev.education || []).length > 0 ? prev.education : cvParseDraft.education,
      certifications: (prev.certifications || []).length > 0 ? prev.certifications : cvParseDraft.certifications,
      preferredJobType: prev.preferredJobType || cvParseDraft.preferredJobType,
      availability: prev.availability || cvParseDraft.availability,
      expectedSalaryAoa: prev.expectedSalaryAoa ?? cvParseDraft.expectedSalaryAoa,
    }));
    if (cvParseDraft.expectedSalaryAoa) setSalaryInput(formatCurrencyInput(cvParseDraft.expectedSalaryAoa));
    setCvDraftDismissed(true);
    sessionStorage.removeItem(CV_DRAFT_SESSION_KEY);
    notify("Sugestões do CV aplicadas. Revise e guarde o perfil.", "success");
  }, [cvParseDraft, notify]);

  const dismissAiDraft = () => {
    setCvDraftDismissed(true);
    sessionStorage.removeItem(CV_DRAFT_SESSION_KEY);
  };

  const toggleSection = (id: string) => {
    setOpenSection((current) => (current === id ? "" : id));
  };

  const openNewExperience = () => {
    setDraftExperience(DEFAULT_EXPERIENCE);
    setEditingExpIndex(null);
    setExpFormError("");
    setExpModalOpen(true);
  };

  const openEditExperience = (index: number) => {
    setDraftExperience(profile.experience?.[index] || DEFAULT_EXPERIENCE);
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
    if (!draftExperience.current && draftExperience.endDate < draftExperience.startDate) {
      setExpFormError("A data de fim deve ser posterior à data de início.");
      return;
    }

    const next = [...(profile.experience || [])];
    if (editingExpIndex === null) {
      next.unshift(draftExperience);
    } else {
      next[editingExpIndex] = draftExperience;
    }
    setProfile((prev) => ({ ...prev, experience: next }));
    setExpModalOpen(false);
  };

  const removeExperience = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      experience: (prev.experience || []).filter((_, i) => i !== index),
    }));
  };

  const openNewEducation = () => {
    setDraftEducation(DEFAULT_EDUCATION);
    setEditingEduIndex(null);
    setEduFormError("");
    setEduModalOpen(true);
  };

  const openEditEducation = (index: number) => {
    setDraftEducation(profile.education?.[index] || DEFAULT_EDUCATION);
    setEditingEduIndex(index);
    setEduFormError("");
    setEduModalOpen(true);
  };

  const saveEducation = () => {
    if (!draftEducation.degree.trim() || !draftEducation.institution.trim() || !draftEducation.startDate || !draftEducation.endDate) {
      setEduFormError("Preencha curso, instituição e datas.");
      return;
    }
    if (draftEducation.endDate < draftEducation.startDate) {
      setEduFormError("A data de fim deve ser posterior à data de início.");
      return;
    }

    const next = [...(profile.education || [])];
    if (editingEduIndex === null) {
      next.unshift(draftEducation);
    } else {
      next[editingEduIndex] = draftEducation;
    }
    setProfile((prev) => ({ ...prev, education: next }));
    setEduModalOpen(false);
  };

  const removeEducation = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      education: (prev.education || []).filter((_, i) => i !== index),
    }));
  };

  const summaryChars = String(profile.summary || "").trim().length;

  const handleGenerateSummary = async () => {
    if (!token) return;
    setGeneratingSummary(true);
    try {
      const result = await authFetch<SummaryDraftResponse>("/candidates/profile/summary-draft", token, {
        method: "POST",
        body: JSON.stringify({ profile }),
        suppressGlobalErrors: true,
      });
      setSummaryDraft(String(result.draft || "").trim());
      setSummaryWarning(String(result.warning || "Revise sempre o texto antes de guardar."));
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Não foi possível gerar o resumo neste momento."));
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleApplySummaryDraft = () => {
    if (!summaryDraft.trim()) return;
    setProfile((prev) => ({
      ...prev,
      summary: summaryDraft.trim(),
      professionalSummary: summaryDraft.trim(),
      bio: summaryDraft.trim(),
    }));
    setSummaryPreview(true);
  };

  const field = (label: string, key: keyof Profile, type = "text", required = false) => (
    <div key={String(key)}>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
        value={(profile[key] as string) ?? ""}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: key === "email" ? e.target.value.trim().toLowerCase() : e.target.value }))}
      />
      {fieldErrors[key] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p> : null}
    </div>
  );

  const selectField = (label: string, key: "preferredJobType" | "availability", options: Array<{ value: string; label: string }>) => (
    <div key={key}>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        <span className="ml-1 text-red-500">*</span>
      </label>
      <select
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
        value={profile[key] ?? ""}
        onChange={(e) => setProfile((prev) => ({ ...prev, [key]: e.target.value }))}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {fieldErrors[key] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p> : null}
    </div>
  );

  const buildPayload = () => ({
    ...profile,
    email: String(profile.email || "").trim().toLowerCase(),
    summary: String(profile.summary || "").trim(),
    professionalSummary: String(profile.summary || "").trim(),
    bio: String(profile.summary || "").trim(),
  });

  const performSave = async (): Promise<boolean> => {
    if (!validateForm()) {
      setMessage("Corrija os erros assinalados antes de guardar.");
      return false;
    }
    setSaving(true);
    try {
      await authFetch("/candidates/profile", token!, {
        method: "PATCH",
        body: JSON.stringify(buildPayload()),
        suppressGlobalErrors: true,
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof ApiError && Array.isArray((err.details as { fieldErrors?: Array<{ field?: string; message?: string }> } | undefined)?.fieldErrors)) {
        const nextErrors: Record<string, string> = {};
        for (const issue of (err.details as { fieldErrors: Array<{ field?: string; message?: string }> }).fieldErrors) {
          if (issue.field && issue.message) nextErrors[issue.field] = issue.message;
        }
        setFieldErrors(nextErrors);
      }
      setMessage(getErrorMessage(err, "Erro ao guardar perfil."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const ok = await performSave();
    if (ok) notify("Progresso guardado com sucesso.", "success");
  };

  const handleSaveLater = async () => {
    setMessage("");
    const ok = await performSave();
    if (ok) {
      notify("Perfil guardado. Continue quando quiser.", "success");
      router.push("/Portal/Candidato/Dashboard");
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="Meu Perfil"
        description="Atualize os seus dados e melhore a qualidade das recomendações de vagas."
        badge="Perfil"
      />

      {fetchError ? (
        <div className="mb-4">
          <InlineErrorState
            title="Não foi possível carregar o perfil"
            message={fetchError}
            actionLabel="Tentar novamente"
            onAction={loadProfile}
          />
        </div>
      ) : null}

      {/* AI suggestions banner — shown when a CV parse draft is available in session */}
      {cvParseDraft && !cvDraftDismissed ? (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold text-blue-900">Sugestões do CV prontas para aplicar</p>
            <p className="mt-1 text-sm text-blue-800">
              O seu CV foi processado com IA. Clique em &ldquo;Aplicar sugestões&rdquo; para preencher
              automaticamente os campos em branco — pode editar tudo antes de guardar.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={applyAiDraft}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Aplicar sugestões
            </button>
            <button
              type="button"
              onClick={dismissAiDraft}
              aria-label="Ignorar sugestões"
              className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
            >
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={profile.fullName} size="xl" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{profile.fullName || "Complete o seu nome"}</h2>
              <p className="text-sm text-slate-600">{profile.professionalTitle || "Adicione o seu título profissional"}</p>
              <p className="mt-1 text-xs text-slate-500">{profile.location || "Localização em falta"}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">CV atual</p>
            <p className="mt-1">{latestCvName || "Ainda não carregou um CV."}</p>
          </div>
        </div>
      </div>

      {/* Profile Completion */}
      <ProfileCompletionCard
        completion={completion}
        missingFields={progressChecklist.filter((item) => !item.done).map((item) => item.label)}
      />

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {progressChecklist.map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                item.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {item.done ? "✓" : "!"} {item.label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">{actionableHint}</p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Skills</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{(profile.skills || []).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Experiência</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{Array.isArray(profile.experience) ? profile.experience.length : 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Educação</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{Array.isArray(profile.education) ? profile.education.length : 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Certificações</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{(profile.certifications || []).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Idiomas</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{(profile.languages || []).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Último CV</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{latestCvName || "Sem CV"}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <SectionContainer
          id="links"
          title="Links Profissionais"
          description="Adicione links de portfólio ou LinkedIn para reforçar o perfil."
          state={(profile.portfolioLinks || []).length > 0 ? "complete" : "empty"}
          completedText={`${(profile.portfolioLinks || []).length} links`}
          isOpen={openSection === "links"}
          onToggle={toggleSection}
        >
          <TagInput
            label="Links"
            placeholder="https://..."
            values={profile.portfolioLinks || []}
            onChange={(next) => setProfile((prev) => ({ ...prev, portfolioLinks: next }))}
            maxLength={120}
          />
        </SectionContainer>
        <SectionContainer
          id="informacao"
          title="Informação Pessoal"
          description="Dados base para recrutadores identificarem o seu perfil."
          state={sectionState.informacao}
          completedText="Nome, email, telefone e localização"
          isOpen={openSection === "informacao"}
          onToggle={toggleSection}
        >
          <div className="grid gap-5 md:grid-cols-2">
            {field("Nome completo", "fullName", "text", true)}
            {field("Email", "email", "email", true)}
            {field("Telefone", "phone", "tel", true)}
            {field("Localização", "location", "text", true)}
            {field("Título profissional", "professionalTitle", "text", true)}
            {selectField("Tipo de trabalho preferido", "preferredJobType", PREFERRED_JOB_TYPE_OPTIONS)}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Expectativa salarial
                <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>
              </label>
              <div className="flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-100">
                <span className="mr-2 text-slate-500">AOA</span>
                <input
                  inputMode="numeric"
                  className="w-full border-0 p-0 text-sm text-slate-900 outline-none"
                  placeholder="250.000"
                  value={salaryInput}
                  onChange={(e) => {
                    const nextSalary = parseExpectedSalary(e.target.value);
                    setSalaryInput(formatCurrencyInput(nextSalary));
                    setProfile((prev) => ({ ...prev, expectedSalaryAoa: nextSalary }));
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Use um valor mensal aproximado em Kwanza.</p>
              {fieldErrors.expectedSalaryAoa ? <p className="mt-1 text-xs text-red-600">{fieldErrors.expectedSalaryAoa}</p> : null}
            </div>
            {selectField("Disponibilidade", "availability", AVAILABILITY_OPTIONS)}
          </div>
        </SectionContainer>

        <SectionContainer
          id="experiencia"
          title="Experiência"
          description="Adicione experiências em formato simples, sem JSON."
          state={sectionState.experiencia}
          completedText={`${(profile.experience || []).length} experiências adicionadas`}
          isOpen={openSection === "experiencia"}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={openNewExperience}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Adicionar experiência
            </button>

            {(profile.experience || []).length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Ainda não adicionou experiências.
              </p>
            ) : (
              <div className="space-y-3">
                {(profile.experience || []).map((item, index) => (
                  <ExperienceCard
                    key={`${item.jobTitle}-${index}`}
                    item={item}
                    onEdit={() => openEditExperience(index)}
                    onDelete={() => removeExperience(index)}
                    onMoveUp={index > 0 ? () => setProfile((prev) => ({ ...prev, experience: reorderItem(prev.experience || [], index, index - 1) })) : undefined}
                    onMoveDown={index < (profile.experience || []).length - 1 ? () => setProfile((prev) => ({ ...prev, experience: reorderItem(prev.experience || [], index, index + 1) })) : undefined}
                  />
                ))}
              </div>
            )}

            {fieldErrors.experience ? <p className="text-xs font-medium text-rose-700">{fieldErrors.experience}</p> : null}
          </div>
        </SectionContainer>

        <SectionContainer
          id="educacao"
          title="Educação"
          description="Formações académicas ou técnicas que reforçam o perfil."
          state={sectionState.educacao}
          completedText={`${(profile.education || []).length} registos de educação`}
          isOpen={openSection === "educacao"}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={openNewEducation}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Adicionar educação
            </button>

            {(profile.education || []).length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Ainda não adicionou formação.
              </p>
            ) : (
              <div className="space-y-3">
                {(profile.education || []).map((item, index) => (
                  <EducationCard
                    key={`${item.degree}-${index}`}
                    item={item}
                    onEdit={() => openEditEducation(index)}
                    onDelete={() => removeEducation(index)}
                    onMoveUp={index > 0 ? () => setProfile((prev) => ({ ...prev, education: reorderItem(prev.education || [], index, index - 1) })) : undefined}
                    onMoveDown={index < (profile.education || []).length - 1 ? () => setProfile((prev) => ({ ...prev, education: reorderItem(prev.education || [], index, index + 1) })) : undefined}
                  />
                ))}
              </div>
            )}

            {fieldErrors.education ? <p className="text-xs font-medium text-rose-700">{fieldErrors.education}</p> : null}
          </div>
        </SectionContainer>

        <SectionContainer
          id="skills"
          title="Skills"
          description="Escreva uma skill por vez e prima Enter."
          state={sectionState.skills}
          completedText={`${(profile.skills || []).length} skills`}
          isOpen={openSection === "skills"}
          onToggle={toggleSection}
        >
          <TagInput
            label="Skills"
            placeholder="Ex.: React"
            values={profile.skills || []}
            onChange={(next) => setProfile((prev) => ({ ...prev, skills: next }))}
            suggestions={SKILL_SUGGESTIONS}
            error={fieldErrors.skills}
            maxLength={35}
          />
        </SectionContainer>

        <SectionContainer
          id="idiomas"
          title="Idiomas"
          description="Adicione idiomas para melhorar matching com requisitos das vagas."
          state={sectionState.idiomas}
          completedText={`${(profile.languages || []).length} idiomas`}
          isOpen={openSection === "idiomas"}
          onToggle={toggleSection}
        >
          <TagInput
            label="Idiomas"
            placeholder="Ex.: Português"
            values={profile.languages || []}
            onChange={(next) => setProfile((prev) => ({ ...prev, languages: next }))}
            suggestions={LANGUAGE_SUGGESTIONS}
            maxLength={30}
          />
        </SectionContainer>

        <SectionContainer
          id="certificacoes"
          title="Certificações"
          description="Adicione certificações relevantes para a sua área."
          state={sectionState.certificacoes}
          completedText={`${(profile.certifications || []).length} certificações`}
          isOpen={openSection === "certificacoes"}
          onToggle={toggleSection}
        >
          <TagInput
            label="Certificações"
            placeholder="Ex.: AWS Cloud Practitioner"
            values={profile.certifications || []}
            onChange={(next) => setProfile((prev) => ({ ...prev, certifications: next }))}
            suggestions={CERT_SUGGESTIONS}
            maxLength={60}
          />
        </SectionContainer>

        <SectionContainer
          id="resumo"
          title="Perfil Profissional (Resumo)"
          description="Conte em poucas linhas quem você é e o valor que entrega."
          state={sectionState.resumo}
          completedText={`${summaryChars} caracteres`}
          isOpen={openSection === "resumo"}
          onToggle={toggleSection}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Sugestão: 150 a 300 caracteres.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSummaryPreview((current) => !current)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {summaryPreview ? "Editar" : "Pré-visualizar"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <SparklesIcon className="h-4 w-4" aria-hidden="true" />
                  {summaryDraft ? "Regenerar" : generatingSummary ? "A gerar..." : "Melhorar resumo com IA"}
                </button>
              </div>
            </div>

            {summaryDraft ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Sugestão de resumo</p>
                <p className="mt-2 leading-6">{summaryDraft}</p>
                <p className="mt-3 text-xs font-medium text-amber-900">{summaryWarning}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleApplySummaryDraft}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Aplicar resumo
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Regerar
                  </button>
                </div>
              </div>
            ) : null}

            {summaryPreview ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {profile.summary?.trim() || "Sem resumo para pré-visualizar."}
              </div>
            ) : (
              <textarea
                rows={5}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                value={profile.summary ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value, professionalSummary: e.target.value, bio: e.target.value }))}
              />
            )}

            {fieldErrors.summary ? <p className="text-xs font-medium text-rose-700">{fieldErrors.summary}</p> : null}
          </div>
        </SectionContainer>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "A guardar..." : "Guardar progresso"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveLater}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "A guardar..." : "Guardar e continuar depois"}
          </button>
          {completion < 100 ? (
            <button
              type="button"
              onClick={goToFirstIncomplete}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <ChevronDownIcon className="h-4 w-4" />
              Ir para secção incompleta
            </button>
          ) : null}
        </div>
      </form>

      <AddItemModal
        open={expModalOpen}
        title={editingExpIndex === null ? "Adicionar experiência" : "Editar experiência"}
        description="Preencha os campos para criar um bloco de experiência profissional."
        onClose={() => setExpModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Cargo</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftExperience.jobTitle} onChange={(e) => setDraftExperience((prev) => ({ ...prev, jobTitle: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Empresa</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftExperience.company} onChange={(e) => setDraftExperience((prev) => ({ ...prev, company: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Localização</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftExperience.location} onChange={(e) => setDraftExperience((prev) => ({ ...prev, location: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Início</label>
            <input type="month" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftExperience.startDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fim</label>
            <input type="month" disabled={draftExperience.current} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" value={draftExperience.endDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, endDate: e.target.value }))} />
          </div>
          <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draftExperience.current} onChange={(e) => setDraftExperience((prev) => ({ ...prev, current: e.target.checked, endDate: e.target.checked ? "" : prev.endDate }))} />
            Trabalho atual
          </label>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Descrição</label>
            <textarea rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftExperience.description} onChange={(e) => setDraftExperience((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
        </div>
        {expFormError ? <p className="mt-3 text-sm font-medium text-rose-700">{expFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setExpModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={saveExperience} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Guardar</button>
        </div>
      </AddItemModal>

      <AddItemModal
        open={eduModalOpen}
        title={editingEduIndex === null ? "Adicionar educação" : "Editar educação"}
        description="Adicione formação académica ou técnica relevante."
        onClose={() => setEduModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Curso / Grau</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.degree} onChange={(e) => setDraftEducation((prev) => ({ ...prev, degree: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Instituição</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.institution} onChange={(e) => setDraftEducation((prev) => ({ ...prev, institution: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Localização</label>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.location} onChange={(e) => setDraftEducation((prev) => ({ ...prev, location: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Início</label>
            <input type="month" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.startDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, startDate: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fim</label>
            <input type="month" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.endDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, endDate: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Descrição (opcional)</label>
            <textarea rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={draftEducation.description} onChange={(e) => setDraftEducation((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
        </div>
        {eduFormError ? <p className="mt-3 text-sm font-medium text-rose-700">{eduFormError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEduModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={saveEducation} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Guardar</button>
        </div>
      </AddItemModal>
    </div>
  );
}
