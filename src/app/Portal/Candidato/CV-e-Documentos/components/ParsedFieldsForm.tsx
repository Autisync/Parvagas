"use client";

import { useState } from "react";
import FeedbackAlert from "@/app/components/errors/FeedbackAlert";
import TagInput from "@/app/components/profile/TagInput";
import AddItemModal from "@/app/components/profile/AddItemModal";
import ExperienceCard, { type ExperienceItem } from "@/app/components/profile/ExperienceCard";
import EducationCard, { type EducationItem } from "@/app/components/profile/EducationCard";
import { SKILL_SUGGESTIONS, LANGUAGE_SUGGESTIONS, CERT_SUGGESTIONS, withOwnValues } from "@/lib/suggestionCatalogs";
import type { ParsedDraft } from "./types";
import { PREFERRED_JOB_TYPE_OPTIONS, AVAILABILITY_OPTIONS, DEFAULT_EXPERIENCE, DEFAULT_EDUCATION } from "./constants";
import { normalizeMoney, reorderItem } from "./utils";

type ParsedFieldsFormProps = {
  draft: ParsedDraft;
  setDraft: (updater: (prev: ParsedDraft | null) => ParsedDraft | null) => void;
  missingSections: string[];
  parseWarning: string;
  lowConfidenceFields: string[];
  cvMappedFields: string[];
  approving: boolean;
  onApprove: () => void;
  onCancel: () => void;
  existingSkills: string[];
  existingLanguages: string[];
  existingCertifications: string[];
  saveError: string;
  onDismissSaveError: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ParsedFieldsForm({
  draft,
  setDraft,
  missingSections,
  parseWarning,
  lowConfidenceFields,
  cvMappedFields,
  approving,
  onApprove,
  onCancel,
  existingSkills,
  existingLanguages,
  existingCertifications,
  saveError,
  onDismissSaveError,
}: ParsedFieldsFormProps) {
  const [approveError, setApproveError] = useState("");
  const displayedError = approveError || saveError;

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
    if (lowConfidenceFields.includes(fieldName)) return `${base} border-amber-300 bg-amber-50`;
    if (cvMappedFields.includes(fieldName)) return `${base} border-blue-300 bg-blue-50`;
    return `${base} border-gray-200`;
  };

  const showLowConfidence = (fieldName: string) => lowConfidenceFields.includes(fieldName);

  const draftExperiences = ((draft.experience as ParsedDraft["experience"]) || []) as ExperienceItem[];
  const draftEducationList = ((draft.education as ParsedDraft["education"]) || []) as EducationItem[];

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
    if (!draftExperience.jobTitle.trim()) {
      setExpFormError("Indique o cargo.");
      document.getElementById("exp-jobTitle")?.focus();
      return;
    }
    if (!draftExperience.company.trim()) {
      setExpFormError("Indique a empresa.");
      document.getElementById("exp-company")?.focus();
      return;
    }
    if (!draftExperience.startDate) {
      setExpFormError("Indique a data de início.");
      document.getElementById("exp-startDate")?.focus();
      return;
    }
    if (!draftExperience.current && !draftExperience.endDate) {
      setExpFormError("Indique a data de fim ou marque como experiência atual.");
      document.getElementById("exp-endDate")?.focus();
      return;
    }
    const next = [...draftExperiences];
    if (editingExpIndex === null) next.unshift(draftExperience);
    else next[editingExpIndex] = draftExperience;
    setDraft((prev) => ({ ...(prev || {}), experience: next }));
    setExpModalOpen(false);
  };

  const removeExperience = (index: number) => {
    setDraft((prev) => ({ ...(prev || {}), experience: draftExperiences.filter((_, i) => i !== index) }));
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
    if (!draftEducation.degree.trim()) {
      setEduFormError("Indique o curso ou grau.");
      document.getElementById("edu-degree")?.focus();
      return;
    }
    if (!draftEducation.institution.trim()) {
      setEduFormError("Indique a instituição.");
      document.getElementById("edu-institution")?.focus();
      return;
    }
    if (!draftEducation.startDate || !draftEducation.endDate) {
      setEduFormError("Indique a data de início e de fim.");
      document.getElementById(!draftEducation.startDate ? "edu-startDate" : "edu-endDate")?.focus();
      return;
    }
    const next = [...draftEducationList];
    if (editingEduIndex === null) next.unshift(draftEducation);
    else next[editingEduIndex] = draftEducation;
    setDraft((prev) => ({ ...(prev || {}), education: next }));
    setEduModalOpen(false);
  };

  const removeEducation = (index: number) => {
    setDraft((prev) => ({ ...(prev || {}), education: draftEducationList.filter((_, i) => i !== index) }));
  };

  const handleApproveClick = () => {
    setApproveError("");
    onDismissSaveError();

    const email = String(draft.email || "").trim();
    if (email && !EMAIL_RE.test(email)) {
      setApproveError("Introduza um email válido antes de guardar.");
      document.getElementById("draft-email")?.focus();
      return;
    }
    if (draft.preferredJobType && !PREFERRED_JOB_TYPE_OPTIONS.some((o) => o.value === draft.preferredJobType)) {
      setApproveError("O tipo de trabalho preferido selecionado é inválido.");
      document.getElementById("draft-preferredJobType")?.focus();
      return;
    }
    if (draft.availability && !AVAILABILITY_OPTIONS.some((o) => o.value === draft.availability)) {
      setApproveError("A disponibilidade selecionada é inválida.");
      document.getElementById("draft-availability")?.focus();
      return;
    }
    if (
      draft.expectedSalaryAoa !== null &&
      draft.expectedSalaryAoa !== undefined &&
      !Number.isFinite(Number(draft.expectedSalaryAoa))
    ) {
      setApproveError("A expectativa salarial deve ser um valor numérico.");
      document.getElementById("draft-expectedSalaryAoa")?.focus();
      return;
    }

    onApprove();
  };

  return (
    <div className="mt-8 rounded-2xl border border-gray-100 p-6">
      <h2 className="mb-4 text-xl font-bold">Revisão dos dados extraídos</h2>
      {parseWarning ? (
        <div className="mb-3">
          <FeedbackAlert variant="warning" message={parseWarning} />
        </div>
      ) : null}
      {missingSections.length > 0 ? (
        <div className="mb-3">
          <FeedbackAlert variant="info" message={`Algumas secções vieram vazias (${missingSections.join(", ")}). Pode preenchê-las manualmente abaixo.`} />
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Nome</span>
          <input className={fieldClass("fullName")} value={String(draft.fullName || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), fullName: e.target.value }))} />
          {showLowConfidence("fullName") ? <p className="mt-1 text-xs text-amber-700">Confirme este valor — a extração automática teve baixa confiança.</p> : null}
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Email</span>
          <input id="draft-email" className={fieldClass("email")} value={String(draft.email || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), email: e.target.value }))} />
          {showLowConfidence("email") ? <p className="mt-1 text-xs text-amber-700">Confirme este valor — a extração automática teve baixa confiança.</p> : null}
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Telefone</span>
          <input className={fieldClass("phone")} value={String(draft.phone || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))} />
          {showLowConfidence("phone") ? <p className="mt-1 text-xs text-amber-700">Confirme este valor — a extração automática teve baixa confiança.</p> : null}
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
            id="draft-preferredJobType"
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
            id="draft-availability"
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
            id="draft-expectedSalaryAoa"
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
          suggestions={withOwnValues(SKILL_SUGGESTIONS, existingSkills)}
        />
        <TagInput
          label="Idiomas"
          placeholder="Ex.: Português"
          values={(draft.languages as string[]) || []}
          onChange={(next) => setDraft((prev) => ({ ...(prev || {}), languages: next }))}
          suggestions={withOwnValues(LANGUAGE_SUGGESTIONS, existingLanguages)}
        />
        <TagInput
          label="Certificações"
          placeholder="Ex.: AWS"
          values={(draft.certifications as string[]) || []}
          onChange={(next) => setDraft((prev) => ({ ...(prev || {}), certifications: next }))}
          suggestions={withOwnValues(CERT_SUGGESTIONS, existingCertifications)}
        />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Experiência profissional</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50" onClick={openNewExperience}>
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
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50" onClick={openNewEducation}>
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

      {displayedError ? (
        <div className="mt-4">
          <FeedbackAlert
            variant="error"
            message={displayedError}
            onDismiss={() => {
              setApproveError("");
              onDismissSaveError();
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 flex gap-3">
        <button onClick={handleApproveClick} disabled={approving} className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {approving ? "A guardar..." : "Confirmar e guardar"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm hover:bg-gray-50">
          Cancelar
        </button>
      </div>

      <AddItemModal
        open={expModalOpen}
        title={editingExpIndex === null ? "Adicionar experiência" : "Editar experiência"}
        onClose={() => setExpModalOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input id="exp-jobTitle" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cargo" value={draftExperience.jobTitle} onChange={(e) => setDraftExperience((prev) => ({ ...prev, jobTitle: e.target.value }))} />
          <input id="exp-company" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Empresa" value={draftExperience.company} onChange={(e) => setDraftExperience((prev) => ({ ...prev, company: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Local" value={draftExperience.location} onChange={(e) => setDraftExperience((prev) => ({ ...prev, location: e.target.value }))} />
          <input id="exp-startDate" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftExperience.startDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input id="exp-endDate" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftExperience.endDate} onChange={(e) => setDraftExperience((prev) => ({ ...prev, endDate: e.target.value }))} disabled={draftExperience.current} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draftExperience.current} onChange={(e) => setDraftExperience((prev) => ({ ...prev, current: e.target.checked, endDate: e.target.checked ? "" : prev.endDate }))} />
            Trabalho atual
          </label>
        </div>
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição" value={draftExperience.description} onChange={(e) => setDraftExperience((prev) => ({ ...prev, description: e.target.value }))} />
        {expFormError ? <div className="mt-3"><FeedbackAlert variant="error" message={expFormError} /></div> : null}
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
          <input id="edu-degree" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Curso/Grau" value={draftEducation.degree} onChange={(e) => setDraftEducation((prev) => ({ ...prev, degree: e.target.value }))} />
          <input id="edu-institution" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Instituição" value={draftEducation.institution} onChange={(e) => setDraftEducation((prev) => ({ ...prev, institution: e.target.value }))} />
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Local" value={draftEducation.location} onChange={(e) => setDraftEducation((prev) => ({ ...prev, location: e.target.value }))} />
          <input id="edu-startDate" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.startDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, startDate: e.target.value }))} />
          <input id="edu-endDate" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="month" value={draftEducation.endDate} onChange={(e) => setDraftEducation((prev) => ({ ...prev, endDate: e.target.value }))} />
        </div>
        <textarea className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Descrição" value={draftEducation.description} onChange={(e) => setDraftEducation((prev) => ({ ...prev, description: e.target.value }))} />
        {eduFormError ? <div className="mt-3"><FeedbackAlert variant="error" message={eduFormError} /></div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setEduModalOpen(false)}>Cancelar</button>
          <button type="button" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={saveEducation}>Guardar</button>
        </div>
      </AddItemModal>
    </div>
  );
}
