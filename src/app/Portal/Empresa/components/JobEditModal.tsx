"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import FormFieldError from "@/app/components/errors/FormFieldError";

type Job = {
  _id: string;
  title?: string;
  description?: string;
  category?: string;
  workMode?: string;
  contractType?: string;
  location?: string;
  salaryRange?: string;
  requiredSkills?: string[];
};

type Props = {
  token: string;
  open: boolean;
  job: Job | null;
  onClose: () => void;
  onSaved: (job: Job) => void;
};

type JobForm = {
  title: string;
  description: string;
  category: string;
  workMode: string;
  contractType: string;
  location: string;
  salaryRange: string;
  requiredSkills: string;
};

const emptyForm: JobForm = {
  title: "",
  description: "",
  category: "",
  workMode: "Presencial",
  contractType: "Efectivo",
  location: "",
  salaryRange: "",
  requiredSkills: "",
};

export default function JobEditModal({ token, open, job, onClose, onSaved }: Props) {
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!job) {
      setForm(emptyForm);
      return;
    }

    setForm({
      title: job.title || "",
      description: job.description || "",
      category: job.category || "",
      workMode: job.workMode || "Presencial",
      contractType: job.contractType || "Efectivo",
      location: job.location || "",
      salaryRange: job.salaryRange || "",
      requiredSkills: (job.requiredSkills || []).join(", "),
    });
  }, [job]);

  if (!open || !job) return null;

  const setField = (k: keyof JobForm, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const showFieldError = (field: string) => submitted || touched[field];
  const titleError = !form.title.trim() ? "Informe o título da vaga." : "";
  const descriptionError = !form.description.trim() ? "Informe a descrição da vaga." : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitted(true);

    if (!form.title.trim() || !form.description.trim()) {
      setError("Preencha os campos obrigatórios para continuar.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        workMode: form.workMode,
        contractType: form.contractType,
        location: form.location.trim(),
        salaryRange: form.salaryRange.trim(),
        requiredSkills: form.requiredSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const response = await authFetch<{ job: Job }>(`/companies/jobs/${job._id}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      onSaved(response.job);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao actualizar vaga.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Editar vaga</h2>
            <p className="mt-1 text-sm text-slate-600">Actualize os dados da vaga. As alterações ficam visíveis imediatamente, sem nova revisão da moderação.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <span className="sr-only">Fechar modal</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
              <input value={form.title} onChange={(e) => setField("title", e.target.value)} onBlur={() => markTouched("title")} aria-invalid={Boolean(showFieldError("title") && titleError)} aria-describedby="edit-job-title-error" className="w-full app-input" />
              <FormFieldError id="edit-job-title-error" message={showFieldError("title") ? titleError : ""} />
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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Competências</label>
            <input value={form.requiredSkills} onChange={(e) => setField("requiredSkills", e.target.value)} className="w-full app-input" placeholder="Excel, SQL, Power BI" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descrição *</label>
            <textarea rows={5} value={form.description} onChange={(e) => setField("description", e.target.value)} onBlur={() => markTouched("description")} aria-invalid={Boolean(showFieldError("description") && descriptionError)} aria-describedby="edit-job-description-error" className="w-full app-input" />
            <FormFieldError id="edit-job-description-error" message={showFieldError("description") ? descriptionError : ""} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="app-btn-primary disabled:opacity-60">
              {saving ? "A guardar..." : "Guardar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
