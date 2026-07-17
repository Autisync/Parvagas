"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  AdminPermissions,
  createScraperSource,
  deleteScraperSource,
  fetchAdminMe,
  fetchScraperSettings,
  fetchScraperSources,
  hasPermission,
  runAdminScraper,
  updateScraperSettings,
  updateScraperSource,
  SCRAPER_SOURCE_TYPES,
  type AdminMe,
  type ScraperSettingsRecord,
  type ScraperSourceRecord,
  type ScraperSourceType,
} from "../adminClient";
import { AdminEmptyState, AdminModal, AdminPageHeader, AdminRestricted, adminButtonClass, adminFieldClass, adminSecondaryButtonClass } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

const emptySourceForm = {
  name: "",
  type: "json" as ScraperSourceType,
  url: "",
  category: "",
  enabled: true,
  maxResults: "",
};

type SourceFormState = typeof emptySourceForm;

const TYPE_LABELS: Record<string, string> = {
  json: "JSON feed",
  rss: "RSS feed",
  greenhouse: "Greenhouse",
  lever: "Lever",
};

function sourceFormFromRecord(record: ScraperSourceRecord): SourceFormState {
  return {
    name: record.name,
    type: (record.type as ScraperSourceType) || "json",
    url: record.url,
    category: record.category || "",
    enabled: record.enabled,
    maxResults: record.maxResults != null ? String(record.maxResults) : "",
  };
}

function toSourcePayload(form: SourceFormState) {
  return {
    name: form.name.trim(),
    type: form.type,
    url: form.url.trim(),
    category: form.category.trim() || null,
    enabled: form.enabled,
    maxResults: form.maxResults.trim() ? Number(form.maxResults) : null,
  };
}

export default function AdminScraperConfigPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [sources, setSources] = useState<ScraperSourceRecord[]>([]);
  const [settings, setSettings] = useState<ScraperSettingsRecord | null>(null);
  const [settingsForm, setSettingsForm] = useState<Partial<ScraperSettingsRecord>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SourceFormState>(emptySourceForm);

  const canManage = useMemo(() => hasPermission(me, AdminPermissions.SCRAPER_SOURCES_MANAGE), [me]);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [currentAdmin, sourcesRes, settingsRes] = await Promise.all([
        fetchAdminMe(token),
        fetchScraperSources(token),
        fetchScraperSettings(token),
      ]);
      setMe(currentAdmin);
      setSources(sourcesRes.scraperSources || []);
      setSettings(settingsRes);
      setSettingsForm(settingsRes);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar configuração do scraper."));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptySourceForm);
    setModalOpen(true);
  };

  const openEdit = (record: ScraperSourceRecord) => {
    setEditingId(record._id);
    setForm(sourceFormFromRecord(record));
    setModalOpen(true);
  };

  const submitSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canManage) return;
    if (!form.name.trim() || !form.url.trim()) {
      notify("Nome e URL são obrigatórios.", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = toSourcePayload(form);
      if (editingId) {
        await updateScraperSource(token, editingId, payload);
        notify("Fonte atualizada.", "success");
      } else {
        await createScraperSource(token, payload);
        notify("Fonte criada.", "success");
      }
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao guardar a fonte."), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (record: ScraperSourceRecord) => {
    if (!token || !canManage) return;
    setBusy(true);
    try {
      await updateScraperSource(token, record._id, { enabled: !record.enabled });
      await load();
      notify(record.enabled ? "Fonte desativada." : "Fonte ativada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar a fonte."), "error");
    } finally {
      setBusy(false);
    }
  };

  const removeSource = async (record: ScraperSourceRecord) => {
    if (!token || !canManage) return;
    if (!window.confirm(`Eliminar a fonte "${record.name}"?`)) return;
    setBusy(true);
    try {
      await deleteScraperSource(token, record._id);
      await load();
      notify("Fonte eliminada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao eliminar a fonte."), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canManage) return;
    setBusy(true);
    try {
      const updated = await updateScraperSettings(token, settingsForm);
      setSettings(updated);
      setSettingsForm(updated);
      notify("Configuração global guardada.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao guardar configuração."), "error");
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!token) return;
    setRunning(true);
    try {
      const res = await runAdminScraper(token);
      notify(res.message || (res.queued ? "Scraper iniciado." : "Sem fontes configuradas."), res.queued ? "success" : "warning");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao iniciar o scraper."), "error");
    } finally {
      setRunning(false);
    }
  };

  if (me && !canManage) {
    return (
      <AdminRestricted title="Acesso restrito">
        Não tem permissão para gerir a configuração do scraper.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Aquisição de Vagas"
        title="Scraper Config"
        description="Fontes externas e afinação do scraper — geridas aqui, sem precisar de redeploy."
        action={
          <button type="button" onClick={runNow} disabled={running} className={adminSecondaryButtonClass}>
            {running ? "A iniciar..." : "Executar scraper agora"}
          </button>
        }
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <section className="app-card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Configuração global</h2>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(settingsForm.enabled)}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Scraping ativo (interruptor mestre)
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Desligar aqui impede qualquer execução do scraper, mesmo com fontes ativas — útil para pausar tudo de imediato.
        </p>

        <form onSubmit={saveSettings} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Timeout por pedido (s)</span>
            <input
              type="number"
              min={1}
              className={adminFieldClass}
              value={settingsForm.defaultTimeoutSeconds ?? ""}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, defaultTimeoutSeconds: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Máx. resultados por fonte (padrão)</span>
            <input
              type="number"
              min={1}
              className={adminFieldClass}
              value={settingsForm.defaultMaxPerSource ?? ""}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, defaultMaxPerSource: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Máx. ingestão por execução</span>
            <input
              type="number"
              min={1}
              className={adminFieldClass}
              value={settingsForm.maxIngestPerRun ?? ""}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, maxIngestPerRun: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Orçamento de tempo por execução (s)</span>
            <input
              type="number"
              min={1}
              className={adminFieldClass}
              value={settingsForm.runBudgetSeconds ?? ""}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, runBudgetSeconds: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">User-Agent (opcional)</span>
            <input
              type="text"
              placeholder="Parvagas-Bot/1.0 (+https://parvagas.pt/robots.txt)"
              className={adminFieldClass}
              value={settingsForm.userAgent ?? ""}
              disabled={!canManage}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, userAgent: e.target.value }))}
            />
          </label>
          {canManage && (
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={busy} className={adminButtonClass}>
                {busy ? "A guardar..." : "Guardar configuração"}
              </button>
            </div>
          )}
        </form>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Fontes</h2>
          {canManage && (
            <button type="button" onClick={openCreate} className={adminButtonClass}>
              Adicionar fonte
            </button>
          )}
        </div>

        {sources.length === 0 ? (
          <div className="mt-4">
            <AdminEmptyState title="Nenhuma fonte configurada" description="Adicione uma fonte para o scraper começar a recolher vagas." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {sources.map((source) => (
              <article key={source._id} className="app-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{source.name}</p>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {TYPE_LABELS[source.type] || source.type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${source.enabled ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {source.enabled ? "Ativa" : "Desativada"}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-500">{source.url}</p>
                    {source.category ? <p className="mt-1 text-xs text-slate-500">Categoria: {source.category}</p> : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {source.lastRunAt
                        ? `Última execução: ${new Date(source.lastRunAt).toLocaleString("pt-PT")} — ${source.lastRunStatus} (${source.lastRunJobCount ?? 0} vagas)`
                        : "Ainda sem execuções"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => toggleEnabled(source)} disabled={busy} className={adminSecondaryButtonClass}>
                        {source.enabled ? "Desativar" : "Ativar"}
                      </button>
                      <button type="button" onClick={() => openEdit(source)} disabled={busy} className={adminSecondaryButtonClass}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSource(source)}
                        disabled={busy}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AdminModal
        open={modalOpen}
        title={editingId ? "Editar fonte" : "Adicionar fonte"}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className={adminSecondaryButtonClass}>
              Cancelar
            </button>
            <button type="submit" form="scraper-source-form" disabled={busy} className={adminButtonClass}>
              {busy ? "A guardar..." : "Guardar"}
            </button>
          </div>
        }
      >
        <form id="scraper-source-form" onSubmit={submitSource} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nome</span>
            <input
              type="text"
              className={adminFieldClass}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tipo</span>
            <select
              className={adminFieldClass}
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ScraperSourceType }))}
            >
              {SCRAPER_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">URL / token / slug</span>
            <input
              type="text"
              placeholder="https://... ou token/slug da empresa"
              className={adminFieldClass}
              value={form.url}
              onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Categoria (opcional)</span>
            <input
              type="text"
              className={adminFieldClass}
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Máx. resultados (opcional — usa o padrão global se vazio)</span>
            <input
              type="number"
              min={1}
              className={adminFieldClass}
              value={form.maxResults}
              onChange={(e) => setForm((prev) => ({ ...prev, maxResults: e.target.value }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Ativa
          </label>
        </form>
      </AdminModal>
    </div>
  );
}
