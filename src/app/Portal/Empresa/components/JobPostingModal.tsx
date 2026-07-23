"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch, ApiError } from "@/lib/api";
import FormFieldError from "@/app/components/errors/FormFieldError";
import { SuccessCheck, MilestoneCelebration } from "@/app/components/motion";
import { track } from "@/lib/analytics";

type CreatedJob = { _id: string; title?: string; status?: string; location?: string; createdAt?: string };

type Props = {
  token: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (job: { _id: string; title?: string; status?: string; location?: string; createdAt?: string }) => void;
};

type JobForm = {
  title: string;
  description: string;
  responsibilities: string;
  requirements: string;
  category: string;
  workMode: string;
  location: string;
  contractType: string;
  salaryRange: string;
  requiredSkills: string[];
};

const initialForm: JobForm = {
  title: "",
  description: "",
  responsibilities: "",
  requirements: "",
  category: "",
  workMode: "Presencial",
  location: "",
  contractType: "Efectivo",
  salaryRange: "",
  requiredSkills: [],
};

// Starter content for a first-time poster facing a blank form — pre-fills
// title/category/responsibilities/requirements/skills for a common role
// shape; everything stays fully editable afterwards, nothing is submitted
// as-is.
const JOB_TEMPLATES: Record<string, Partial<JobForm>> = {
  vendas: {
    title: "Comercial / Representante de Vendas",
    category: "Vendas",
    responsibilities: "Prospecção e angariação de novos clientes\nApresentação de produtos/serviços a potenciais clientes\nNegociação e fecho de vendas\nAcompanhamento pós-venda e fidelização de clientes\nElaboração de relatórios de vendas periódicos",
    requirements: "Experiência mínima de 2 anos em vendas\nBoa capacidade de comunicação e negociação\nOrientação para resultados e cumprimento de metas\nCarta de condução (vantagem)",
    requiredSkills: ["Negociação", "Atendimento ao cliente", "Prospecção"],
  },
  administrativo: {
    title: "Assistente Administrativo/a",
    category: "Administrativo",
    responsibilities: "Gestão de correspondência e arquivo de documentos\nApoio à organização de reuniões e agendas\nProcessamento de dados e elaboração de relatórios\nAtendimento telefónico e presencial\nSuporte geral às diferentes áreas da empresa",
    requirements: "Formação mínima ao nível do 12º ano\nDomínio de Microsoft Office (Word, Excel)\nOrganização, rigor e atenção ao detalhe\nBoa capacidade de comunicação",
    requiredSkills: ["Microsoft Office", "Organização", "Atendimento ao cliente"],
  },
  tecnico: {
    title: "Técnico/a de Manutenção",
    category: "Técnico / Operações",
    responsibilities: "Manutenção preventiva e corretiva de equipamentos\nDiagnóstico e resolução de avarias\nElaboração de relatórios técnicos\nGarantia do cumprimento das normas de segurança\nApoio a outras equipas técnicas quando necessário",
    requirements: "Formação técnica na área relevante\nExperiência mínima de 2 anos em função similar\nConhecimentos de normas de segurança no trabalho\nDisponibilidade para trabalho por turnos (se aplicável)",
    requiredSkills: ["Manutenção", "Segurança no trabalho", "Diagnóstico técnico"],
  },
};

export default function JobPostingModal({ token, open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<JobForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [skillsInput, setSkillsInput] = useState("");
  const [postedJob, setPostedJob] = useState<CreatedJob | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  if (!open) return null;

  const finish = () => {
    if (postedJob) onCreated?.(postedJob);
    setForm(initialForm);
    setSkillsInput("");
    setSubmitted(false);
    setPostedJob(null);
    setCelebrate(false);
    onClose();
  };

  const setField = (k: keyof JobForm, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const applyTemplate = (key: string) => {
    const template = JOB_TEMPLATES[key];
    if (!template) return;
    setForm((prev) => ({ ...prev, ...template }));
  };
  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const showFieldError = (field: string) => submitted || touched[field];
  const titleError = !form.title.trim() ? "Informe o título da vaga." : "";
  const descriptionError = !form.description.trim() ? "Informe a descrição da vaga." : "";
  const responsibilitiesError = !form.responsibilities.trim() ? "Descreva as principais responsabilidades." : "";
  const requirementsError = !form.requirements.trim() ? "Descreva os requisitos da função." : "";
  const skillsError = form.requiredSkills.some((skill) => skill.length > 30)
    ? "Cada competência deve ter no máximo 30 caracteres."
    : "";

  const addSkill = (rawValue: string) => {
    const normalized = rawValue.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    if (normalized.length > 30) {
      setError("Cada competência deve ter no máximo 30 caracteres.");
      return;
    }

    const hasSkill = form.requiredSkills.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (hasSkill) return;
    if (form.requiredSkills.length >= 15) {
      setError("Limite máximo de 15 competências por vaga.");
      return;
    }

    setForm((prev) => ({ ...prev, requiredSkills: [...prev.requiredSkills, normalized] }));
    setSkillsInput("");
    setError("");
  };

  const removeSkill = (skill: string) => {
    setForm((prev) => ({ ...prev, requiredSkills: prev.requiredSkills.filter((item) => item !== skill) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setQuotaExceeded(false);
    setSubmitted(true);

    if (!form.title.trim() || !form.description.trim() || !form.responsibilities.trim() || !form.requirements.trim()) {
      setError("Preencha os campos obrigatórios para continuar.");
      return;
    }
    if (skillsError) {
      setError(skillsError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        responsibilities: form.responsibilities.trim(),
        requirements: form.requirements.trim(),
        category: form.category.trim(),
        workMode: form.workMode,
        location: form.location.trim(),
        contractType: form.contractType,
        salaryRange: form.salaryRange.trim(),
        requiredSkills: form.requiredSkills,
        visibility: "public",
      };

      const response = await authFetch<{ job: { _id: string; title?: string; status?: string; location?: string; createdAt?: string } }>(
        "/companies/jobs",
        token,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setPostedJob(response.job);
      setCelebrate(true);
      track("company_job_posted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao submeter vaga.");
      setQuotaExceeded(err instanceof ApiError && err.status === 402);
    } finally {
      setSaving(false);
    }
  };

  if (postedJob) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
        <MilestoneCelebration show={celebrate} onDone={() => setCelebrate(false)} />
        <div className="app-card pv-animate-pop w-full max-w-md p-8 text-center">
          <div className="flex justify-center">
            <SuccessCheck size={84} tone="brand" />
          </div>
          <h2 className="mt-6 text-balance text-xl font-bold text-[var(--text-strong)]">Vaga submetida!</h2>
          <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
            {postedJob.title ? `“${postedJob.title}” foi criada` : "A vaga foi criada"} e segue para aprovação
            interna antes de ficar visível publicamente.
          </p>
          <button type="button" onClick={finish} className="app-btn-primary mt-7 px-6 py-2.5 text-sm">
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Novo pedido de vaga</h2>
            <p className="mt-1 text-sm text-slate-600">Esta vaga entra na aprovação interna da empresa antes de eventual revisão da plataforma.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            aria-label="Fechar modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="text-xs font-semibold text-slate-600">Começar a partir de um modelo:</span>
          <button type="button" onClick={() => applyTemplate("vendas")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Vendas</button>
          <button type="button" onClick={() => applyTemplate("administrativo")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Administrativo</button>
          <button type="button" onClick={() => applyTemplate("tecnico")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Técnico</button>
          <span className="text-xs text-slate-500">— pré-preenche os campos abaixo; edite livremente antes de submeter.</span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Informação principal</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
              <input value={form.title} onChange={(e) => setField("title", e.target.value)} onBlur={() => markTouched("title")} aria-invalid={Boolean(showFieldError("title") && titleError)} aria-describedby="job-title-error" className="w-full app-input" />
              <FormFieldError id="job-title-error" message={showFieldError("title") ? titleError : ""} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
              <input value={form.category} onChange={(e) => setField("category", e.target.value)} className="w-full app-input" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Localização</label>
              <input value={form.location} onChange={(e) => setField("location", e.target.value)} className="w-full app-input" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Salário</label>
              <input value={form.salaryRange} onChange={(e) => setField("salaryRange", e.target.value)} className="w-full app-input" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Modalidade</label>
              <select value={form.workMode} onChange={(e) => setField("workMode", e.target.value)} className="w-full app-input">
                <option>Presencial</option>
                <option>Hibrido</option>
                <option>Remoto</option>
                <option>Rotativo</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Contrato</label>
              <select value={form.contractType} onChange={(e) => setField("contractType", e.target.value)} className="w-full app-input">
                <option>Efectivo</option>
                <option>Prazo certo</option>
                <option>Prestação de serviços</option>
                <option>Estágio</option>
              </select>
            </div>
          </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Competências e descrição</p>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">Competências (Enter ou vírgula para adicionar)</label>
              <input
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkill(skillsInput);
                  }
                  if (e.key === "Backspace" && !skillsInput && form.requiredSkills.length > 0) {
                    removeSkill(form.requiredSkills[form.requiredSkills.length - 1]);
                  }
                }}
                onBlur={() => addSkill(skillsInput)}
                placeholder="Ex: Excel avançado"
                className="w-full app-input"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {form.requiredSkills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                  >
                    <span>{skill}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Máximo 15 competências, sem duplicados.</p>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
              <textarea rows={5} value={form.description} onChange={(e) => setField("description", e.target.value)} onBlur={() => markTouched("description")} aria-invalid={Boolean(showFieldError("description") && descriptionError)} aria-describedby="job-description-error" className="w-full app-input" />
              <FormFieldError id="job-description-error" message={showFieldError("description") ? descriptionError : ""} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Responsabilidades *</label>
                <textarea
                  rows={4}
                  value={form.responsibilities}
                  onChange={(e) => setField("responsibilities", e.target.value)}
                  onBlur={() => markTouched("responsibilities")}
                  aria-invalid={Boolean(showFieldError("responsibilities") && responsibilitiesError)}
                  aria-describedby="job-responsibilities-error"
                  className="w-full app-input"
                  placeholder="Ex: Gerir equipa de vendas e garantir metas mensais"
                />
                <FormFieldError id="job-responsibilities-error" message={showFieldError("responsibilities") ? responsibilitiesError : ""} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Requisitos *</label>
                <textarea
                  rows={4}
                  value={form.requirements}
                  onChange={(e) => setField("requirements", e.target.value)}
                  onBlur={() => markTouched("requirements")}
                  aria-invalid={Boolean(showFieldError("requirements") && requirementsError)}
                  aria-describedby="job-requirements-error"
                  className="w-full app-input"
                  placeholder="Ex: Experiência mínima de 3 anos e domínio de Excel"
                />
                <FormFieldError id="job-requirements-error" message={showFieldError("requirements") ? requirementsError : ""} />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-600">{error}</p>
              {quotaExceeded && (
                <Link
                  href="/Portal/Empresa/Planos"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Fazer upgrade do plano
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="app-btn-secondary px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="app-btn-primary min-w-[160px] px-5 py-2.5 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "A submeter..." : "Submeter pedido"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
