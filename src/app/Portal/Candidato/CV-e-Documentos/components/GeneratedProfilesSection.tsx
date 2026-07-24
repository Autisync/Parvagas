"use client";

import type { GeneratedCvProfile } from "./types";
import { TARGET_FIELDS } from "./constants";
import { toCsv, fromCsv } from "./utils";

type GeneratedProfilesSectionProps = {
  targetField: string;
  onTargetFieldChange: (value: string) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  generating: boolean;
  onGenerate: (e: React.FormEvent) => void;

  profiles: GeneratedCvProfile[];
  loadingLists: boolean;
  editingId: string | null;
  editingDraft: GeneratedCvProfile | null;
  onStartEdit: (item: GeneratedCvProfile) => void;
  onEditDraftChange: (next: GeneratedCvProfile) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  savingEdit: boolean;
  onDuplicate: (id: string) => void;
  duplicatingId: string | null;
  onDelete: (id: string) => void;
  deletingId: string | null;
};

export default function GeneratedProfilesSection({
  targetField,
  onTargetFieldChange,
  jobDescription,
  onJobDescriptionChange,
  generating,
  onGenerate,
  profiles,
  loadingLists,
  editingId,
  editingDraft,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
  savingEdit,
  onDuplicate,
  duplicatingId,
  onDelete,
  deletingId,
}: GeneratedProfilesSectionProps) {
  return (
    <>
      <section className="mt-10 rounded-2xl border border-gray-100 p-6">
        <h2 className="text-xl font-bold">Gerar CV por área de emprego</h2>
        <p className="mt-1 text-sm text-gray-500">Cria uma versão especializada sem alterar o seu perfil principal.</p>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onGenerate}>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Área alvo</span>
            <select className="w-full rounded-xl border border-gray-200 px-3 py-2" value={targetField} onChange={(e) => onTargetFieldChange(e.target.value)}>
              {TARGET_FIELDS.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-gray-600">Descrição da vaga (opcional)</span>
            <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={jobDescription} onChange={(e) => onJobDescriptionChange(e.target.value)} />
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
        {!loadingLists && profiles.length === 0 ? <p className="text-sm text-gray-500">Ainda não gerou nenhum perfil CV por área.</p> : null}
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
                        <button className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60" disabled={duplicatingId === item._id || deletingId === item._id} onClick={() => onStartEdit(item)}>Editar</button>
                        <button className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60" disabled={duplicatingId === item._id || deletingId === item._id} onClick={() => onDuplicate(item._id)}>
                          {duplicatingId === item._id ? "A duplicar..." : "Duplicar"}
                        </button>
                        <button className="rounded border px-2 py-1 text-red-600 disabled:cursor-not-allowed disabled:opacity-60" disabled={duplicatingId === item._id || deletingId === item._id} onClick={() => onDelete(item._id)}>
                          {deletingId === item._id ? "A eliminar..." : "Eliminar"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-gray-700">{item.professionalSummary || "Sem resumo."}</p>
                    <p className="mt-2 text-xs text-gray-500">Keywords: {(item.suggestedKeywords || []).slice(0, 8).join(", ") || "N/A"}</p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">Resumo profissional</span>
                      <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.professionalSummary || ""} onChange={(e) => onEditDraftChange({ ...editingDraft, professionalSummary: e.target.value })} />
                    </label>
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-gray-600">Competências-chave (separadas por vírgula)</span>
                      <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.keySkills)} onChange={(e) => onEditDraftChange({ ...editingDraft, keySkills: fromCsv(e.target.value) })} />
                    </label>
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-gray-600">Palavras-chave sugeridas (separadas por vírgula)</span>
                      <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.suggestedKeywords)} onChange={(e) => onEditDraftChange({ ...editingDraft, suggestedKeywords: fromCsv(e.target.value) })} />
                    </label>
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-gray-600">Rascunho de carta de apresentação</span>
                      <textarea rows={4} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.coverLetterDraft || ""} onChange={(e) => onEditDraftChange({ ...editingDraft, coverLetterDraft: e.target.value })} />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={savingEdit} onClick={onSaveEdit}>
                        {savingEdit ? "A guardar..." : "Guardar"}
                      </button>
                      <button className="rounded border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={savingEdit} onClick={onCancelEdit}>Cancelar</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
