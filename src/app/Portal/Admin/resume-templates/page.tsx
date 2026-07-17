"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  createAdminResumeTemplate,
  fetchAdminResumeTemplates,
  updateAdminResumeTemplate,
  type ResumeTemplateRecord,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminModal,
  AdminPageHeader,
  AdminSpinner,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

const emptyForm = { slug: "", name: "", description: "", previewUrl: "" };

export default function AdminResumeTemplatesPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();
  const [templates, setTemplates] = useState<ResumeTemplateRecord[]>([]);
  const [availableSlugs, setAvailableSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminResumeTemplates(token);
      setTemplates(res.resumeTemplates || []);
      setAvailableSlugs(res.availableSlugs || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar templates."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const registeredSlugs = new Set(templates.map((t) => t.slug));
  const unusedSlugs = availableSlugs.filter((slug) => !registeredSlugs.has(slug));

  const openCreate = () => {
    setForm({ ...emptyForm, slug: unusedSlugs[0] || "" });
    setFormError("");
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (!token) return;
    if (!form.slug.trim() || !form.name.trim()) {
      setFormError("Slug e nome são obrigatórios.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await createAdminResumeTemplate(token, {
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        previewUrl: form.previewUrl.trim() || undefined,
        isActive: true,
      });
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      notify("Template criado.", "success");
      setShowCreate(false);
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "Erro ao criar template."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: ResumeTemplateRecord) => {
    if (!token) return;
    setBusyId(t._id);
    try {
      const updated = await updateAdminResumeTemplate(token, t._id, { isActive: !t.isActive });
      setTemplates((prev) => prev.map((row) => (row._id === t._id ? updated : row)));
      notify(`Template ${updated.isActive ? "ativado" : "desativado"}.`, "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar template."), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Conteúdo"
        title="Templates de Currículo"
        description="Gerir quais templates estão disponíveis aos candidatos e a sua descrição."
      />

      <AdminAlert tone="warning">
        Cada template aqui é apenas metadados (nome, descrição, imagem de pré-visualização). A
        renderização real é feita por um registo de código (`resume_render_service.py`) associado
        ao <span className="font-mono">slug</span>. Só é possível criar um template para um slug já
        registado no código — para um visual genuinamente novo é preciso implementar o renderizador
        primeiro.
      </AdminAlert>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          {unusedSlugs.length > 0
            ? `Slugs registados no código sem template: ${unusedSlugs.join(", ")}`
            : "Todos os slugs registados no código já têm um template."}
        </p>
        <button
          type="button"
          className={adminButtonClass}
          onClick={openCreate}
          disabled={unusedSlugs.length === 0}
        >
          Novo template
        </button>
      </div>

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      {loading ? (
        <div className="mt-6"><AdminSpinner /></div>
      ) : templates.length === 0 ? (
        <div className="mt-6">
          <AdminEmptyState title="Sem templates" description="Ainda não existem templates registados." />
        </div>
      ) : (
        <section className="mt-6 space-y-3">
          {templates.map((t) => (
            <article key={t._id} className="app-card flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {t.name} <span className="font-mono text-xs text-slate-400">({t.slug})</span>
                </p>
                {t.description ? <p className="mt-1 text-sm text-slate-600">{t.description}</p> : null}
              </div>
              <button
                type="button"
                disabled={busyId === t._id}
                onClick={() => toggleActive(t)}
                className={[
                  "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60",
                  t.isActive ? "bg-emerald-600" : "bg-slate-300",
                ].join(" ")}
                aria-pressed={t.isActive}
                aria-label={`${t.isActive ? "Desativar" : "Ativar"} ${t.name}`}
              >
                <span
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                    t.isActive ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </article>
          ))}
        </section>
      )}

      <AdminModal open={showCreate} title="Novo template" onClose={() => setShowCreate(false)}>
        <div className="space-y-4">
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            <div>
              <label className="block text-sm font-medium text-slate-700">Slug</label>
              <select
                className={adminFieldClass}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              >
                {unusedSlugs.map((slug) => (
                  <option key={slug} value={slug}>{slug}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Nome</label>
              <input
                className={adminFieldClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Descrição</label>
              <textarea
                className={adminFieldClass}
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">URL de pré-visualização</label>
              <input
                className={adminFieldClass}
                value={form.previewUrl}
                onChange={(e) => setForm((f) => ({ ...f, previewUrl: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" className={adminSecondaryButtonClass} onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button type="button" className={adminButtonClass} disabled={saving} onClick={submitCreate}>
                {saving ? "A guardar..." : "Criar"}
              </button>
            </div>
        </div>
      </AdminModal>
    </div>
  );
}
