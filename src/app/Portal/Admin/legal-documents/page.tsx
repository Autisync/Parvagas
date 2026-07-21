"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  createAdminLegalDocument,
  createAdminLegalDocumentVersion,
  fetchAdminLegalDocument,
  fetchAdminLegalDocumentAcceptanceSummary,
  fetchAdminLegalDocuments,
  publishAdminLegalDocumentVersion,
  updateAdminLegalDocumentVersion,
  type LegalDocumentAudience,
  type LegalDocumentDetail,
  type LegalDocumentRecord,
  type LegalDocumentVersionRecord,
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
import LegalMarkdown from "@/app/components/legal/LegalMarkdown";

const AUDIENCE_LABEL: Record<LegalDocumentAudience, string> = { public: "Público", employer: "Empresas", internal: "Interno" };
const AUDIENCE_TONE: Record<LegalDocumentAudience, string> = {
  public: "border-emerald-200 bg-emerald-50 text-emerald-700",
  employer: "border-sky-200 bg-sky-50 text-sky-700",
  internal: "border-slate-300 bg-slate-100 text-slate-700",
};

function nextVersionLabel(previous?: string | null): string {
  const stamp = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  return previous === stamp ? `${stamp}-2` : stamp;
}

const emptyCreateForm = { slug: "", title: "", category: "", audience: "public" as LegalDocumentAudience, requiresAcceptance: false };

export default function AdminLegalDocumentsPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [documents, setDocuments] = useState<LegalDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LegalDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminLegalDocuments(token);
      setDocuments(res.legalDocuments || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar documentos legais."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openDocument = useCallback(
    async (id: string) => {
      if (!token) return;
      setSelectedId(id);
      setDetail(null);
      setAcceptedCount(null);
      setShowPreview(false);
      setDetailLoading(true);
      try {
        const d = await fetchAdminLegalDocument(token, id);
        setDetail(d);
        const draft = d.versions.find((v) => v.status === "draft");
        setDraftBody(draft ? draft.bodyMarkdown : d.currentVersion?.bodyMarkdown ?? "");
        setDraftLabel(draft ? draft.versionLabel : nextVersionLabel(d.currentVersion?.versionLabel));
        if (d.requiresAcceptance) {
          fetchAdminLegalDocumentAcceptanceSummary(token, id)
            .then((s) => setAcceptedCount(s.acceptedCount))
            .catch(() => {});
        }
      } catch (err: unknown) {
        notify(getErrorMessage(err, "Erro ao carregar o documento."), "error");
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token, notify],
  );

  const refreshDetail = useCallback(async () => {
    if (!token || !selectedId) return;
    const d = await fetchAdminLegalDocument(token, selectedId);
    setDetail(d);
    return d;
  }, [token, selectedId]);

  const draftVersion = detail?.versions.find((v) => v.status === "draft") ?? null;
  const hasUnsavedChanges = draftVersion ? draftVersion.bodyMarkdown !== draftBody || draftVersion.versionLabel !== draftLabel : Boolean(draftBody.trim());

  const saveDraft = async () => {
    if (!token || !detail) return;
    if (!draftLabel.trim() || !draftBody.trim()) {
      notify("Indique um rótulo de versão e o conteúdo antes de guardar.", "error");
      return;
    }
    setSaving(true);
    try {
      if (draftVersion) {
        await updateAdminLegalDocumentVersion(token, detail._id, draftVersion._id, {
          bodyMarkdown: draftBody, versionLabel: draftLabel.trim(),
        });
      } else {
        await createAdminLegalDocumentVersion(token, detail._id, {
          versionLabel: draftLabel.trim(), bodyMarkdown: draftBody,
        });
      }
      notify("Rascunho guardado.", "success");
      await refreshDetail();
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao guardar rascunho."), "error");
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!token || !detail) return;
    let target = draftVersion;
    setPublishing(true);
    try {
      if (!target || hasUnsavedChanges) {
        // Save first so what's published matches exactly what's on screen.
        if (target) {
          await updateAdminLegalDocumentVersion(token, detail._id, target._id, { bodyMarkdown: draftBody, versionLabel: draftLabel.trim() });
        } else {
          target = await createAdminLegalDocumentVersion(token, detail._id, { versionLabel: draftLabel.trim(), bodyMarkdown: draftBody });
        }
      }
      if (!target) return;
      if (!window.confirm(`Publicar a versão "${draftLabel.trim()}"? Isto substitui de imediato a versão atualmente visível ao público.`)) {
        setPublishing(false);
        return;
      }
      await publishAdminLegalDocumentVersion(token, detail._id, target._id);
      notify("Versão publicada.", "success");
      await refreshDetail();
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao publicar versão."), "error");
    } finally {
      setPublishing(false);
    }
  };

  const submitCreate = async () => {
    if (!token) return;
    if (!createForm.slug.trim() || !createForm.title.trim() || !createForm.category.trim()) {
      setCreateError("Slug, título e categoria são obrigatórios.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await createAdminLegalDocument(token, {
        slug: createForm.slug.trim().toLowerCase(),
        title: createForm.title.trim(),
        category: createForm.category.trim(),
        audience: createForm.audience,
        requiresAcceptance: createForm.requiresAcceptance,
      });
      notify("Documento criado. Adicione uma versão para o publicar.", "success");
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
      load();
    } catch (err: unknown) {
      setCreateError(getErrorMessage(err, "Erro ao criar documento."));
    } finally {
      setCreating(false);
    }
  };

  const grouped: Record<LegalDocumentAudience, LegalDocumentRecord[]> = { public: [], employer: [], internal: [] };
  documents.forEach((d) => grouped[d.audience]?.push(d));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Legal & Conformidade"
        title="Documentos Legais"
        description="Editar e publicar as políticas públicas e internas da Parvagas. Publicar uma nova versão arquiva automaticamente a anterior."
      />

      <div className="mt-4 flex justify-end">
        <button type="button" className={adminButtonClass} onClick={() => { setCreateForm(emptyCreateForm); setCreateError(""); setShowCreate(true); }}>
          Novo documento
        </button>
      </div>

      {error ? <div className="mt-4"><InlineErrorState message={error} onAction={load} /></div> : null}

      {loading ? (
        <div className="mt-6"><AdminSpinner /></div>
      ) : documents.length === 0 ? (
        <div className="mt-6"><AdminEmptyState title="Sem documentos" description="Ainda não existem documentos legais registados." /></div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            {(["public", "employer", "internal"] as LegalDocumentAudience[]).map((aud) =>
              grouped[aud].length === 0 ? null : (
                <section key={aud}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{AUDIENCE_LABEL[aud]}</h2>
                  <ul className="mt-2 space-y-1.5">
                    {grouped[aud].map((doc) => (
                      <li key={doc._id}>
                        <button
                          type="button"
                          onClick={() => openDocument(doc._id)}
                          className={[
                            "w-full rounded-xl border px-3 py-2.5 text-left transition",
                            selectedId === doc._id ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-red-200 hover:bg-red-50/40",
                          ].join(" ")}
                        >
                          <span className="block text-sm font-semibold text-slate-900">{doc.title}</span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{doc.slug}</span>
                            {doc.currentVersion ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">v{doc.currentVersion.versionLabel}</span>
                            ) : (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">sem publicação</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>

          <div>
            {!selectedId ? (
              <AdminEmptyState title="Selecione um documento" description="Escolha um documento à esquerda para ver o histórico e editar." />
            ) : detailLoading || !detail ? (
              <AdminSpinner />
            ) : (
              <div className="app-card space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">{detail.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${AUDIENCE_TONE[detail.audience]}`}>{AUDIENCE_LABEL[detail.audience]}</span>
                      <span className="font-mono text-slate-500">{detail.slug}</span>
                      {detail.requiresAcceptance ? (
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">
                          requer aceitação{acceptedCount !== null ? ` · ${acceptedCount} aceitaram a versão atual` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button type="button" className={adminSecondaryButtonClass} onClick={() => setShowPreview((v) => !v)}>
                    {showPreview ? "Ver editor" : "Pré-visualizar"}
                  </button>
                </div>

                {detail.currentVersion ? (
                  <p className="text-xs text-slate-500">
                    Publicado atualmente: versão <b>{detail.currentVersion.versionLabel}</b>
                    {detail.currentVersion.effectiveDate ? ` · em vigor desde ${new Date(detail.currentVersion.effectiveDate).toLocaleDateString("pt-PT")}` : ""}
                  </p>
                ) : (
                  <AdminAlert tone="warning">Este documento ainda não tem nenhuma versão publicada — não é visível publicamente.</AdminAlert>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700">Rótulo da versão em edição</label>
                  <input className={`${adminFieldClass} max-w-xs`} value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="ex.: 2026-08" />
                </div>

                {showPreview ? (
                  <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5">
                    <LegalMarkdown markdown={draftBody} />
                  </div>
                ) : (
                  <textarea
                    className={`${adminFieldClass} min-h-[420px] font-mono text-[13px] leading-6`}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    spellCheck={false}
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    {draftVersion ? `A editar o rascunho "${draftVersion.versionLabel}".` : "Ainda sem rascunho — guardar cria um novo."}
                    {hasUnsavedChanges ? " Há alterações por guardar." : ""}
                  </p>
                  <div className="flex gap-3">
                    <button type="button" className={adminSecondaryButtonClass} disabled={saving || !hasUnsavedChanges} onClick={saveDraft}>
                      {saving ? "A guardar..." : "Guardar rascunho"}
                    </button>
                    <button type="button" className={adminButtonClass} disabled={publishing || !draftBody.trim()} onClick={publishDraft}>
                      {publishing ? "A publicar..." : "Publicar"}
                    </button>
                  </div>
                </div>

                {detail.versions.length > 0 ? (
                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico de versões</h3>
                    <ul className="mt-2 space-y-1.5">
                      {detail.versions.map((v: LegalDocumentVersionRecord) => (
                        <li key={v._id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
                          <span className="font-mono">{v.versionLabel}</span>
                          <span
                            className={[
                              "rounded-full border px-2 py-0.5 font-semibold",
                              v.status === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : v.status === "draft" ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-100 text-slate-500",
                            ].join(" ")}
                          >
                            {v.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      <AdminModal open={showCreate} title="Novo documento legal" onClose={() => setShowCreate(false)}>
        <div className="space-y-4">
          {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          <div>
            <label className="block text-sm font-medium text-slate-700">Slug (URL)</label>
            <input className={adminFieldClass} value={createForm.slug} onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))} placeholder="ex.: acordo-parceiros" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Título</label>
            <input className={adminFieldClass} value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Categoria</label>
            <input className={adminFieldClass} value={createForm.category} onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))} placeholder="ex.: partner_agreement" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Audiência</label>
            <select
              className={adminFieldClass}
              value={createForm.audience}
              onChange={(e) => setCreateForm((f) => ({ ...f, audience: e.target.value as LegalDocumentAudience }))}
            >
              <option value="public">Público</option>
              <option value="employer">Empresas</option>
              <option value="internal">Interno</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createForm.requiresAcceptance}
              onChange={(e) => setCreateForm((f) => ({ ...f, requiresAcceptance: e.target.checked }))}
            />
            Requer aceitação explícita do utilizador
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" className={adminSecondaryButtonClass} onClick={() => setShowCreate(false)}>Cancelar</button>
            <button type="button" className={adminButtonClass} disabled={creating} onClick={submitCreate}>
              {creating ? "A criar..." : "Criar"}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
