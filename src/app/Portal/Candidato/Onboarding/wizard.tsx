"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, setUser, getUser } from "@/lib/api";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  PlusIcon,
  TrashIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

// ── Types ────────────────────────────────────────────────────────────────────

type ExperienceItem = {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
};

type EducationItem = {
  id: string;
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

type WizardState = {
  // Step 1 – CV
  cvParsed: boolean;
  parseRunId: string | null;
  // Step 2 – Personal
  fullName: string;
  email: string;
  phone: string;
  location: string;
  nationality: string;
  expectedSalaryAoa: string;
  preferredJobType: string;
  availability: string;
  professionalTitle: string;
  // Step 3 – Experience
  experience: ExperienceItem[];
  // Step 4 – Education
  education: EducationItem[];
  // Step 5 – Skills
  skills: string[];
  languages: string[];
  certifications: string[];
  // Step 6 – Summary
  summary: string;
};

const INITIAL_STATE: WizardState = {
  cvParsed: false,
  parseRunId: null,
  fullName: "",
  email: "",
  phone: "",
  location: "",
  nationality: "",
  expectedSalaryAoa: "",
  preferredJobType: "",
  availability: "",
  professionalTitle: "",
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
  summary: "",
};

const JOB_TYPES = [
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

const AVAILABILITY = [
  { value: "imediata", label: "Imediata" },
  { value: "1_semana", label: "1 semana" },
  { value: "2_semanas", label: "2 semanas" },
  { value: "1_mes", label: "1 mês" },
  { value: "2_meses", label: "2 meses" },
  { value: "a_combinar", label: "A combinar" },
];

const STEPS = [
  "CV",
  "Dados pessoais",
  "Experiência",
  "Educação",
  "Competências",
  "Resumo",
  "Confirmação",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const emptyExp = (): ExperienceItem => ({
  id: uid(),
  jobTitle: "",
  company: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
});

const emptyEdu = (): EducationItem => ({
  id: uid(),
  degree: "",
  institution: "",
  location: "",
  startDate: "",
  endDate: "",
  description: "",
});

// ── Tag input component ───────────────────────────────────────────────────────

function TagInput({
  label,
  hint,
  tags,
  onChange,
}: {
  label: string;
  hint?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = Array.from(new Set([...tags, ...parts]));
    onChange(next);
    setInput("");
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 p-2 min-h-[44px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remover ${tag}`}
              className="ml-0.5 text-red-400 hover:text-red-700"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (["Enter", ","].includes(e.key) && input.trim()) {
              e.preventDefault();
              add(input);
            }
          }}
          onBlur={() => { if (input.trim()) add(input); }}
          placeholder="Escreva e pressione Enter…"
          className="min-w-[160px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}

// ── Input / Textarea helpers ─────────────────────────────────────────────────

function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100";

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function OnboardingWizard({ rerun = false }: { rerun?: boolean }) {
  const router = useRouter();
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Load existing profile data into wizard state on mount
  useEffect(() => {
    if (!token) return;
    authFetch<{ profile: Record<string, unknown> }>("/candidates/profile", token, { suppressGlobalErrors: true })
      .then(({ profile }) => {
        if (!profile) return;
        setData((prev) => ({
          ...prev,
          fullName: String(profile.fullName || ""),
          email: String(profile.email || ""),
          phone: String(profile.phone || ""),
          location: String(profile.location || ""),
          nationality: String(profile.nationality || ""),
          expectedSalaryAoa: profile.expectedSalaryAoa ? String(profile.expectedSalaryAoa) : "",
          preferredJobType: String(profile.preferredJobType || ""),
          availability: String(profile.availability || ""),
          professionalTitle: String(profile.professionalTitle || ""),
          skills: Array.isArray(profile.skills) ? (profile.skills as string[]) : [],
          languages: Array.isArray(profile.languages) ? (profile.languages as string[]) : [],
          certifications: Array.isArray(profile.certifications) ? (profile.certifications as string[]) : [],
          summary: String(profile.summary || profile.professionalSummary || ""),
          experience: Array.isArray(profile.experience)
            ? (profile.experience as ExperienceItem[]).map((e) => ({ ...e, id: e.id || uid() }))
            : [],
          education: Array.isArray(profile.education)
            ? (profile.education as EducationItem[]).map((e) => ({ ...e, id: e.id || uid() }))
            : [],
        }));
      })
      .catch(() => {/* profile may not exist yet — ignore */});
  }, [token]);

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" });

  const patch = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!token) return;
      await authFetch("/candidates/profile", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    [token]
  );

  const next = async () => {
    setError("");
    setSaving(true);
    try {
      // Save progress at each step
      const snapshot = buildProfileSnapshot(data);
      await patch(snapshot);
      setStep((s) => s + 1);
      scrollTop();
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao guardar progresso.");
    } finally {
      setSaving(false);
    }
  };

  const back = () => { setStep((s) => s - 1); scrollTop(); };

  const finish = async () => {
    setError("");
    setSaving(true);
    try {
      const snapshot = buildProfileSnapshot(data);
      await authFetch("/candidates/onboarding/complete", token!, {
        method: "PATCH",
        body: JSON.stringify(snapshot),
      });
      // Update locally stored user flag
      const stored = getUser();
      if (stored) setUser({ ...stored, hasCompletedOnboarding: true });
      router.replace("/Portal/Candidato/Dashboard?onboarded=1");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao finalizar onboarding.");
    } finally {
      setSaving(false);
    }
  };

  const handleCvUpload = async (file: File) => {
    if (!token) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("cv", file);
      const result = await authFetch<{
        parseRunId?: string;
        profileDraft?: Record<string, unknown>;
        parserError?: string;
      }>("/candidates/cv/parse", token, {
        method: "POST",
        body: form,
        // Don't set Content-Type — browser will set multipart boundary
        headers: {} as HeadersInit,
      });
      if (result.profileDraft) {
        const p = result.profileDraft;
        setData((prev) => ({
          ...prev,
          cvParsed: true,
          parseRunId: result.parseRunId || null,
          fullName: String(p.fullName || prev.fullName),
          email: String(p.email || prev.email),
          phone: String(p.phone || prev.phone),
          location: String(p.location || prev.location),
          professionalTitle: String(p.professionalTitle || prev.professionalTitle),
          skills: Array.isArray(p.skills) && (p.skills as string[]).length > 0 ? (p.skills as string[]) : prev.skills,
          languages: Array.isArray(p.languages) && (p.languages as string[]).length > 0 ? (p.languages as string[]) : prev.languages,
          summary: String(p.summary || p.professionalSummary || prev.summary),
          experience: Array.isArray(p.experience) && (p.experience as ExperienceItem[]).length > 0
            ? (p.experience as ExperienceItem[]).map((e) => ({ ...e, id: uid() }))
            : prev.experience,
          education: Array.isArray(p.education) && (p.education as EducationItem[]).length > 0
            ? (p.education as EducationItem[]).map((e) => ({ ...e, id: uid() }))
            : prev.education,
        }));
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao processar CV.");
    } finally {
      setUploading(false);
    }
  };

  const generateSummary = async () => {
    if (!token) return;
    setAiGenerating(true);
    setError("");
    try {
      const snapshot = buildProfileSnapshot(data);
      const result = await authFetch<{ summary?: string; draft?: string }>(
        "/candidates/profile/summary-draft",
        token,
        { method: "POST", body: JSON.stringify({ profile: snapshot }) }
      );
      const draft = result.summary || result.draft || "";
      if (draft) setData((prev) => ({ ...prev, summary: draft }));
    } catch (err: unknown) {
      setError("Não foi possível gerar o resumo. Preencha manualmente.");
    } finally {
      setAiGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div ref={topRef} className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-semibold text-red-600">
          {rerun ? "Actualizar perfil" : "Bem-vindo ao Parvagas"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {rerun ? "Reveja e actualize o seu perfil" : "Configure o seu perfil profissional"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Passo {step} de {STEPS.length} — {STEPS[step - 1]}
        </p>
        {/* Progress bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-red-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
          />
        </div>
        {/* Step pills */}
        <div className="mt-3 hidden sm:flex items-center gap-1 overflow-x-auto">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                  i + 1 === step
                    ? "bg-red-600 text-white"
                    : i + 1 < step
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 1 < step ? "✓ " : ""}{label}
              </span>
              {i < STEPS.length - 1 && <div className="mx-1 h-px w-4 bg-slate-200" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 1 && (
          <StepCv
            data={data}
            onUpload={handleCvUpload}
            uploading={uploading}
            fileRef={fileRef}
            setData={setData}
          />
        )}
        {step === 2 && <StepPersonal data={data} setData={setData} />}
        {step === 3 && <StepExperience data={data} setData={setData} />}
        {step === 4 && <StepEducation data={data} setData={setData} />}
        {step === 5 && <StepSkills data={data} setData={setData} />}
        {step === 6 && (
          <StepSummary
            data={data}
            setData={setData}
            onGenerate={generateSummary}
            aiGenerating={aiGenerating}
          />
        )}
        {step === 7 && <StepConfirm data={data} onEdit={setStep} />}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeftIcon className="h-4 w-4" /> Anterior
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length ? (
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? "A guardar…" : "Seguinte"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? "A finalizar…" : "Finalizar perfil"}
              <CheckCircleIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Skip for first-time only */}
        {!rerun && step === 1 && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={async () => {
                try {
                  await authFetch("/candidates/onboarding/complete", token!, { method: "PATCH", body: JSON.stringify({}) });
                  const stored = getUser();
                  if (stored) setUser({ ...stored, hasCompletedOnboarding: true });
                } catch { /* silently skip */ }
                router.replace("/Portal/Candidato/Dashboard");
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              Pular configuração por agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step helpers ──────────────────────────────────────────────────────────────

function buildProfileSnapshot(data: WizardState): Record<string, unknown> {
  return {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    location: data.location,
    nationality: data.nationality,
    expectedSalaryAoa: data.expectedSalaryAoa ? parseInt(data.expectedSalaryAoa.replace(/\D/g, ""), 10) || null : null,
    preferredJobType: data.preferredJobType,
    availability: data.availability,
    professionalTitle: data.professionalTitle,
    skills: data.skills,
    languages: data.languages,
    certifications: data.certifications,
    summary: data.summary,
    professionalSummary: data.summary,
    experience: data.experience.map(({ id: _id, ...rest }) => rest),
    education: data.education.map(({ id: _id, ...rest }) => rest),
  };
}

// ── Step 1: CV Upload ──────────────────────────────────────────────────────────

function StepCv({
  data, onUpload, uploading, fileRef, setData,
}: {
  data: WizardState;
  onUpload: (f: File) => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Carregue o seu CV</h2>
        <p className="mt-1 text-sm text-slate-500">
          Carregue um CV em PDF ou DOCX e o sistema extrai os dados automaticamente.
          Em alternativa, descarregue o nosso modelo e preencha manualmente.
        </p>
      </div>

      {data.cvParsed && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          ✓ CV processado com sucesso. Os dados foram preenchidos nos passos seguintes — pode revê-los e editar.
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-left transition hover:border-red-400 hover:bg-red-100 disabled:opacity-60"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white">
            <CloudArrowUpIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{uploading ? "A processar…" : "Carregar o meu CV"}</p>
            <p className="mt-0.5 text-xs text-slate-500">PDF ou DOCX, máx. 8 MB</p>
          </div>
        </button>

        <a
          href="/templates/modelo-cv-parvagas.docx"
          download
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-white">
            <ArrowDownTrayIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Descarregar modelo</p>
            <p className="mt-0.5 text-xs text-slate-500">Modelo DOCX com instruções</p>
          </div>
        </a>
      </div>

      <p className="text-xs text-slate-400">
        Pode avançar sem carregar o CV e preencher os dados manualmente.
      </p>
    </div>
  );
}

// ── Step 2: Personal Details ───────────────────────────────────────────────────

function StepPersonal({
  data, setData,
}: {
  data: WizardState;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const s = <K extends keyof WizardState>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Dados pessoais</h2>
        <p className="mt-1 text-sm text-slate-500">Informação básica visível às empresas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" required>
          <input className={inputCls} value={data.fullName} onChange={s("fullName")} placeholder="Ex: Ana Paula Ferreira" />
        </Field>
        <Field label="Email" required>
          <input type="email" className={inputCls} value={data.email} onChange={s("email")} placeholder="email@exemplo.com" />
        </Field>
        <Field label="Telefone" hint="+244 9xx xxx xxx">
          <input className={inputCls} value={data.phone} onChange={s("phone")} placeholder="+244 900 000 000" />
        </Field>
        <Field label="Localização" hint="Cidade, País">
          <input className={inputCls} value={data.location} onChange={s("location")} placeholder="Luanda, Angola" />
        </Field>
        <Field label="Nacionalidade">
          <input className={inputCls} value={data.nationality} onChange={s("nationality")} placeholder="Angolana" />
        </Field>
        <Field label="Título profissional" hint="Cargo/função desejado">
          <input className={inputCls} value={data.professionalTitle} onChange={s("professionalTitle")} placeholder="Engenheiro de Software" />
        </Field>
        <Field label="Pretensão salarial (AOA)" hint="Valor bruto mensal em Kwanza">
          <input
            className={inputCls}
            value={data.expectedSalaryAoa}
            onChange={s("expectedSalaryAoa")}
            placeholder="150000"
            inputMode="numeric"
          />
        </Field>
        <Field label="Tipo de trabalho preferido">
          <select className={inputCls} value={data.preferredJobType} onChange={s("preferredJobType")}>
            <option value="">Selecione…</option>
            {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Disponibilidade">
          <select className={inputCls} value={data.availability} onChange={s("availability")}>
            <option value="">Selecione…</option>
            {AVAILABILITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ── Step 3: Experience ─────────────────────────────────────────────────────────

function StepExperience({
  data, setData,
}: {
  data: WizardState;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const update = (id: string, field: keyof ExperienceItem, value: string | boolean) =>
    setData((p) => ({
      ...p,
      experience: p.experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));

  const add = () => setData((p) => ({ ...p, experience: [...p.experience, emptyExp()] }));
  const remove = (id: string) => setData((p) => ({ ...p, experience: p.experience.filter((e) => e.id !== id) }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Experiência profissional</h2>
        <p className="mt-1 text-sm text-slate-500">Adicione os seus cargos anteriores e actuais.</p>
      </div>

      {data.experience.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 text-center">
          Nenhuma experiência adicionada. Clique em &quot;Adicionar&quot; para começar.
        </p>
      )}

      {data.experience.map((exp, i) => (
        <div key={exp.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Experiência {i + 1}</p>
            <button type="button" onClick={() => remove(exp.id)} className="text-slate-400 hover:text-red-600">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cargo">
              <input className={inputCls} value={exp.jobTitle} onChange={(e) => update(exp.id, "jobTitle", e.target.value)} placeholder="Desenvolvedor Frontend" />
            </Field>
            <Field label="Empresa">
              <input className={inputCls} value={exp.company} onChange={(e) => update(exp.id, "company", e.target.value)} placeholder="Empresa Lda." />
            </Field>
            <Field label="Localização">
              <input className={inputCls} value={exp.location} onChange={(e) => update(exp.id, "location", e.target.value)} placeholder="Luanda" />
            </Field>
            <Field label="Data de início">
              <input type="month" className={inputCls} value={exp.startDate} onChange={(e) => update(exp.id, "startDate", e.target.value)} />
            </Field>
            {!exp.current && (
              <Field label="Data de fim">
                <input type="month" className={inputCls} value={exp.endDate} onChange={(e) => update(exp.id, "endDate", e.target.value)} />
              </Field>
            )}
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id={`current-${exp.id}`}
                checked={exp.current}
                onChange={(e) => update(exp.id, "current", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-400"
              />
              <label htmlFor={`current-${exp.id}`} className="text-sm text-slate-600">Cargo actual</label>
            </div>
          </div>
          <Field label="Descrição">
            <textarea
              className={inputCls + " min-h-[72px] resize-y"}
              value={exp.description}
              onChange={(e) => update(exp.id, "description", e.target.value)}
              placeholder="Descreva as suas responsabilidades…"
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        <PlusIcon className="h-4 w-4" /> Adicionar experiência
      </button>
    </div>
  );
}

// ── Step 4: Education ─────────────────────────────────────────────────────────

function StepEducation({
  data, setData,
}: {
  data: WizardState;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const update = (id: string, field: keyof EducationItem, value: string) =>
    setData((p) => ({
      ...p,
      education: p.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));

  const add = () => setData((p) => ({ ...p, education: [...p.education, emptyEdu()] }));
  const remove = (id: string) => setData((p) => ({ ...p, education: p.education.filter((e) => e.id !== id) }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Educação</h2>
        <p className="mt-1 text-sm text-slate-500">Cursos, licenciaturas, mestrados e outras formações.</p>
      </div>

      {data.education.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 text-center">
          Nenhuma formação adicionada. Clique em &quot;Adicionar&quot; para começar.
        </p>
      )}

      {data.education.map((edu, i) => (
        <div key={edu.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Formação {i + 1}</p>
            <button type="button" onClick={() => remove(edu.id)} className="text-slate-400 hover:text-red-600">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Grau / Curso">
              <input className={inputCls} value={edu.degree} onChange={(e) => update(edu.id, "degree", e.target.value)} placeholder="Licenciatura em Informática" />
            </Field>
            <Field label="Instituição">
              <input className={inputCls} value={edu.institution} onChange={(e) => update(edu.id, "institution", e.target.value)} placeholder="Universidade Agostinho Neto" />
            </Field>
            <Field label="Localização">
              <input className={inputCls} value={edu.location} onChange={(e) => update(edu.id, "location", e.target.value)} placeholder="Luanda" />
            </Field>
            <Field label="Data de início">
              <input type="month" className={inputCls} value={edu.startDate} onChange={(e) => update(edu.id, "startDate", e.target.value)} />
            </Field>
            <Field label="Data de conclusão">
              <input type="month" className={inputCls} value={edu.endDate} onChange={(e) => update(edu.id, "endDate", e.target.value)} />
            </Field>
          </div>
          <Field label="Descrição">
            <textarea
              className={inputCls + " min-h-[60px] resize-y"}
              value={edu.description}
              onChange={(e) => update(edu.id, "description", e.target.value)}
              placeholder="Especializações, honras…"
            />
          </Field>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        <PlusIcon className="h-4 w-4" /> Adicionar formação
      </button>
    </div>
  );
}

// ── Step 5: Skills ─────────────────────────────────────────────────────────────

function StepSkills({
  data, setData,
}: {
  data: WizardState;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Competências, idiomas e certificações</h2>
        <p className="mt-1 text-sm text-slate-500">Escreva e pressione Enter ou vírgula para adicionar. Aceita listas separadas por vírgulas.</p>
      </div>

      <TagInput
        label="Competências técnicas e soft skills"
        hint="Ex: React, Node.js, Comunicação, Liderança"
        tags={data.skills}
        onChange={(tags) => setData((p) => ({ ...p, skills: tags }))}
      />
      <TagInput
        label="Idiomas"
        hint="Ex: Português (nativo), Inglês (B2), Francês (A2)"
        tags={data.languages}
        onChange={(tags) => setData((p) => ({ ...p, languages: tags }))}
      />
      <TagInput
        label="Certificações"
        hint="Ex: AWS Certified, Google Analytics, PMP"
        tags={data.certifications}
        onChange={(tags) => setData((p) => ({ ...p, certifications: tags }))}
      />
    </div>
  );
}

// ── Step 6: Summary ────────────────────────────────────────────────────────────

function StepSummary({
  data, setData, onGenerate, aiGenerating,
}: {
  data: WizardState;
  setData: React.Dispatch<React.SetStateAction<WizardState>>;
  onGenerate: () => void;
  aiGenerating: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Resumo profissional</h2>
        <p className="mt-1 text-sm text-slate-500">
          Uma apresentação breve de quem é e o que oferece. 2 a 4 frases.
        </p>
      </div>

      <textarea
        className={inputCls + " min-h-[140px] resize-y"}
        value={data.summary}
        onChange={(e) => setData((p) => ({ ...p, summary: e.target.value }))}
        placeholder="Sou um profissional com X anos de experiência em…"
      />

      <button
        type="button"
        onClick={onGenerate}
        disabled={aiGenerating}
        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        <SparklesIcon className="h-4 w-4" />
        {aiGenerating ? "A gerar…" : "Gerar resumo com IA"}
      </button>

      {data.summary && (
        <p className="text-xs text-slate-400">
          ✓ Reveja o texto gerado e edite antes de avançar — o conteúdo reflecte os dados inseridos.
        </p>
      )}
    </div>
  );
}

// ── Step 7: Confirmation ───────────────────────────────────────────────────────

function StepConfirm({
  data, onEdit,
}: {
  data: WizardState;
  onEdit: (step: number) => void;
}) {
  const Section = ({
    title, step, children,
  }: {
    title: string; step: number; children: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="text-xs font-semibold text-red-600 hover:underline"
        >
          Editar
        </button>
      </div>
      {children}
    </div>
  );

  const kv = (label: string, value: string | number | null | undefined) =>
    value ? (
      <div key={label} className="flex flex-wrap gap-x-4 text-sm">
        <span className="w-36 shrink-0 font-medium text-slate-500">{label}</span>
        <span className="text-slate-800">{value}</span>
      </div>
    ) : null;

  const Tags = ({ items }: { items: string[] }) =>
    items.length === 0 ? (
      <p className="text-xs text-slate-400 italic">Nenhum</p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span key={t} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            {t}
          </span>
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Confirmação</h2>
        <p className="mt-1 text-sm text-slate-500">
          Reveja os seus dados. Clique em &quot;Editar&quot; para corrigir qualquer secção antes de finalizar.
        </p>
      </div>

      <Section title="Dados pessoais" step={2}>
        <div className="space-y-1.5">
          {kv("Nome", data.fullName)}
          {kv("Email", data.email)}
          {kv("Telefone", data.phone)}
          {kv("Localização", data.location)}
          {kv("Título", data.professionalTitle)}
          {kv("Disponibilidade", data.availability)}
          {kv("Salário (AOA)", data.expectedSalaryAoa || null)}
        </div>
      </Section>

      <Section title="Experiência" step={3}>
        {data.experience.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nenhuma experiência adicionada.</p>
        ) : (
          <ul className="space-y-2">
            {data.experience.map((e, i) => (
              <li key={e.id} className="text-sm text-slate-700">
                <span className="font-semibold">{e.jobTitle}</span> — {e.company}
                {e.location ? `, ${e.location}` : ""}
                {e.startDate ? ` (${e.startDate} – ${e.current ? "actual" : e.endDate || "?"})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Educação" step={4}>
        {data.education.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nenhuma formação adicionada.</p>
        ) : (
          <ul className="space-y-2">
            {data.education.map((e) => (
              <li key={e.id} className="text-sm text-slate-700">
                <span className="font-semibold">{e.degree}</span> — {e.institution}
                {e.startDate ? ` (${e.startDate} – ${e.endDate || "?"})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Competências" step={5}>
        <div className="space-y-2">
          <div><p className="mb-1 text-xs font-medium text-slate-500">Skills</p><Tags items={data.skills} /></div>
          <div><p className="mb-1 text-xs font-medium text-slate-500">Idiomas</p><Tags items={data.languages} /></div>
          <div><p className="mb-1 text-xs font-medium text-slate-500">Certificações</p><Tags items={data.certifications} /></div>
        </div>
      </Section>

      <Section title="Resumo profissional" step={6}>
        {data.summary ? (
          <p className="text-sm text-slate-700 leading-relaxed">{data.summary}</p>
        ) : (
          <p className="text-xs text-slate-400 italic">Nenhum resumo adicionado.</p>
        )}
      </Section>
    </div>
  );
}
