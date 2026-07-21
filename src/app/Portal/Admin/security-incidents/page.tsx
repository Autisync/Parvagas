"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  assessAdminSecurityIncident,
  closeAdminSecurityIncident,
  containAdminSecurityIncident,
  createAdminSecurityIncident,
  fetchAdminSecurityIncident,
  fetchAdminSecurityIncidents,
  noteAdminSecurityIncident,
  notifyAuthorityAdminSecurityIncident,
  notifyClientAdminSecurityIncident,
  notifySubjectsAdminSecurityIncident,
  remediateAdminSecurityIncident,
  type SecurityIncidentRecord,
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
import { useAppNotifier } from "@/app/components/AppNotifier";

const SEVERITY_TONE: Record<string, string> = {
  critica: "border-red-300 bg-red-50 text-red-800",
  alta: "border-orange-200 bg-orange-50 text-orange-800",
  media: "border-amber-200 bg-amber-50 text-amber-800",
  baixa: "border-slate-200 bg-slate-100 text-slate-600",
};
const SEVERITY_LABEL: Record<string, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };

function DeadlineClock({ incident }: { incident: SecurityIncidentRecord }) {
  if (!incident.isPersonalDataBreach || !incident.notificationDeadline) return null;
  if (incident.authorityNotifiedAt) {
    return <p className="mt-2 text-sm font-medium text-emerald-700">Autoridade notificada — prazo cumprido.</p>;
  }
  const remaining = incident.hoursRemaining ?? 0;
  const overdue = remaining < 0;
  const urgent = remaining >= 0 && remaining <= 24;
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-sm font-semibold ${overdue ? "border-red-300 bg-red-50 text-red-800" : urgent ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
      {overdue
        ? `Prazo de 72h ULTRAPASSADO — notifique a autoridade de controlo (APD/CNPD) de imediato.`
        : `Restam ${remaining.toFixed(1)}h para notificar a autoridade de controlo (prazo Art. 33.º RGPD).`}
    </div>
  );
}

const emptyForm = { title: "", description: "", severity: "baixa" };

export default function AdminSecurityIncidentsPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [incidents, setIncidents] = useState<SecurityIncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SecurityIncidentRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [containmentAction, setContainmentAction] = useState("");
  const [isBreach, setIsBreach] = useState<"true" | "false">("false");
  const [riskLevel, setRiskLevel] = useState("none");
  const [affectedCategories, setAffectedCategories] = useState("");
  const [affectedCount, setAffectedCount] = useState("");
  const [remediationNotes, setRemediationNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminSecurityIncidents(token, openOnly);
      setIncidents(res.incidents || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar os incidentes."));
    } finally {
      setLoading(false);
    }
  }, [token, openOnly]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    try {
      const record = await fetchAdminSecurityIncident(token, id);
      setDetail(record);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível carregar o incidente."), "error");
    }
  }, [token, notify]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const refresh = async () => {
    await load();
    if (selectedId) await loadDetail(selectedId);
  };

  const runAction = async (fn: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      notify(successMessage, "success");
      await refresh();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível concluir a ação."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!token || !form.title.trim() || !form.description.trim()) return;
    setBusy(true);
    try {
      const created = await createAdminSecurityIncident(token, form);
      notify("Incidente registado.", "success");
      setCreateOpen(false);
      setForm(emptyForm);
      await load();
      setSelectedId(created.id);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível registar o incidente."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleContain = () => {
    if (!selectedId || !token || !containmentAction.trim()) return;
    runAction(() => containAdminSecurityIncident(token, selectedId, containmentAction.trim()), "Ação de contenção registada.")
      .then(() => setContainmentAction(""));
  };

  const handleAssess = () => {
    if (!selectedId || !token) return;
    runAction(() => assessAdminSecurityIncident(token, selectedId, {
      isPersonalDataBreach: isBreach === "true",
      riskLevel: isBreach === "true" ? riskLevel : undefined,
      affectedDataCategories: affectedCategories,
      affectedSubjectCountEstimate: affectedCount ? Number(affectedCount) : undefined,
    }), "Avaliação de impacto registada.");
  };

  const handleNotifyAuthority = () => {
    if (!selectedId || !token) return;
    if (!window.confirm("Confirmar que a autoridade de controlo (APD/CNPD) foi notificada?")) return;
    runAction(() => notifyAuthorityAdminSecurityIncident(token, selectedId), "Notificação à autoridade registada.");
  };

  const handleNotifySubjects = () => {
    if (!selectedId || !token) return;
    if (!window.confirm("Confirmar que os titulares de dados afetados foram notificados?")) return;
    runAction(() => notifySubjectsAdminSecurityIncident(token, selectedId), "Notificação aos titulares registada.");
  };

  const handleNotifyClient = () => {
    if (!selectedId || !token) return;
    runAction(() => notifyClientAdminSecurityIncident(token, selectedId), "Notificação ao cliente registada.");
  };

  const handleRemediate = () => {
    if (!selectedId || !token || !remediationNotes.trim()) return;
    runAction(() => remediateAdminSecurityIncident(token, selectedId, remediationNotes.trim()), "Remediação registada.")
      .then(() => setRemediationNotes(""));
  };

  const handleClose = () => {
    if (!selectedId || !token) return;
    if (!window.confirm("Encerrar este incidente? Confirme que a comunicação foi enviada e o remediação concluída.")) return;
    runAction(() => closeAdminSecurityIncident(token, selectedId, reviewNotes.trim()), "Incidente encerrado.")
      .then(() => setReviewNotes(""));
  };

  const handleNote = () => {
    if (!selectedId || !token || !note.trim()) return;
    runAction(() => noteAdminSecurityIncident(token, selectedId, note.trim()), "Nota adicionada.")
      .then(() => setNote(""));
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Segurança & Acesso"
        title="Incidentes de Segurança"
        description="Runbook de resposta a incidentes e notificação de violações de dados pessoais (Art. 33.º/34.º RGPD) — ver Política de Segurança e Notificação de Incidentes (documento interno)."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              Apenas em aberto
            </label>
            <button type="button" onClick={() => setCreateOpen(true)} className={adminButtonClass}>
              Registar incidente
            </button>
          </div>

          {error && <AdminAlert tone="error">{error}</AdminAlert>}

          {loading ? (
            <div className="mt-4 flex justify-center py-8"><AdminSpinner size="md" /></div>
          ) : incidents.length === 0 ? (
            <div className="mt-4"><AdminEmptyState title="Sem incidentes" description="Não existem incidentes neste filtro." /></div>
          ) : (
            <div className="mt-4 space-y-2">
              {incidents.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedId === i.id ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{i.title}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[i.severity]}`}>
                      {SEVERITY_LABEL[i.severity]}
                    </span>
                  </div>
                  {i.isPersonalDataBreach && !i.authorityNotifiedAt && i.hoursRemaining != null && (
                    <p className={`mt-1 text-xs font-medium ${i.hoursRemaining < 24 ? "text-red-600" : "text-amber-600"}`}>
                      {i.hoursRemaining < 0 ? "Prazo 72h ultrapassado" : `${i.hoursRemaining.toFixed(0)}h restantes (72h)`}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">{i.createdAt ? new Date(i.createdAt).toLocaleString("pt-PT") : ""}{i.closedAt ? " · encerrado" : ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!detail ? (
            <AdminEmptyState title="Selecione um incidente" description="Escolha um incidente na lista para ver detalhes e agir." />
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{detail.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{detail.description}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${SEVERITY_TONE[detail.severity]}`}>
                    {SEVERITY_LABEL[detail.severity]}
                  </span>
                </div>
                <DeadlineClock incident={detail} />
                {detail.closedAt && (
                  <p className="mt-2 text-sm text-slate-500">Encerrado em {new Date(detail.closedAt).toLocaleString("pt-PT")}</p>
                )}
              </div>

              {!detail.closedAt && (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Passo 2 — Contenção</h3>
                    {detail.containedAt && <p className="mt-1 text-xs text-emerald-700">Contido em {new Date(detail.containedAt).toLocaleString("pt-PT")}</p>}
                    <textarea value={containmentAction} onChange={(e) => setContainmentAction(e.target.value)} rows={2} placeholder="Ex.: credenciais revogadas, sistema isolado" className={`${adminFieldClass} mt-2`} />
                    <button type="button" disabled={busy || !containmentAction.trim()} onClick={handleContain} className={`${adminSecondaryButtonClass} mt-2`}>
                      Registar ação de contenção
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Passo 3/4 — Avaliação de Impacto</h3>
                    {detail.impactAssessedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Avaliado: {detail.isPersonalDataBreach ? "confirmado como violação de dados pessoais" : "não confirmado como violação"}
                        {detail.riskLevel ? ` · risco: ${detail.riskLevel}` : ""}
                      </p>
                    )}
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-sm text-slate-700">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Violação de dados pessoais?</span>
                        <select value={isBreach} onChange={(e) => setIsBreach(e.target.value as "true" | "false")} className={adminFieldClass}>
                          <option value="false">Não</option>
                          <option value="true">Sim</option>
                        </select>
                      </label>
                      {isBreach === "true" && (
                        <label className="text-sm text-slate-700">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Risco para titulares</span>
                          <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className={adminFieldClass}>
                            <option value="none">Nenhum</option>
                            <option value="low">Baixo</option>
                            <option value="high">Elevado (Art. 34.º)</option>
                          </select>
                        </label>
                      )}
                    </div>
                    <input type="text" value={affectedCategories} onChange={(e) => setAffectedCategories(e.target.value)} placeholder="Categorias de dados afetadas" className={`${adminFieldClass} mt-2`} />
                    <input type="number" min={0} value={affectedCount} onChange={(e) => setAffectedCount(e.target.value)} placeholder="Nº estimado de titulares afetados" className={`${adminFieldClass} mt-2`} />
                    <button type="button" disabled={busy} onClick={handleAssess} className={`${adminSecondaryButtonClass} mt-2`}>
                      Guardar avaliação
                    </button>
                  </div>

                  {detail.isPersonalDataBreach && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900">Passo 5 — Notificação</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!detail.authorityNotifiedAt ? (
                          <button type="button" disabled={busy} onClick={handleNotifyAuthority} className={adminButtonClass}>
                            Marcar autoridade notificada (Art. 33.º)
                          </button>
                        ) : (
                          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            Autoridade notificada em {new Date(detail.authorityNotifiedAt).toLocaleString("pt-PT")}
                          </span>
                        )}
                        {detail.riskLevel === "high" && (
                          !detail.subjectsNotifiedAt ? (
                            <button type="button" disabled={busy} onClick={handleNotifySubjects} className={adminSecondaryButtonClass}>
                              Marcar titulares notificados (Art. 34.º)
                            </button>
                          ) : (
                            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                              Titulares notificados
                            </span>
                          )
                        )}
                        {!detail.clientNotifiedAt ? (
                          <button type="button" disabled={busy} onClick={handleNotifyClient} className={adminSecondaryButtonClass}>
                            Marcar cliente empresarial notificado (DPA, 48h)
                          </button>
                        ) : (
                          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                            Cliente notificado
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Passo 6 — Remediação</h3>
                    {detail.remediatedAt && <p className="mt-1 text-xs text-emerald-700">Remediado em {new Date(detail.remediatedAt).toLocaleString("pt-PT")}: {detail.remediationNotes}</p>}
                    <textarea value={remediationNotes} onChange={(e) => setRemediationNotes(e.target.value)} rows={2} placeholder="Causa raiz corrigida, medidas de reforço" className={`${adminFieldClass} mt-2`} />
                    <button type="button" disabled={busy || !remediationNotes.trim()} onClick={handleRemediate} className={`${adminSecondaryButtonClass} mt-2`}>
                      Registar remediação
                    </button>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Passo 7 — Encerrar e Revisão Pós-Incidente</h3>
                    <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} placeholder="Linha temporal, causa, impacto, lições aprendidas" className={`${adminFieldClass} mt-2`} />
                    <button type="button" disabled={busy} onClick={handleClose} className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                      Encerrar incidente
                    </button>
                  </div>
                </>
              )}

              {detail.closedAt && detail.postIncidentReviewNotes && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Revisão pós-incidente</h3>
                  <p className="mt-1 text-sm text-slate-700">{detail.postIncidentReviewNotes}</p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">Registo cronológico</h3>
                <div className="mt-3 space-y-2">
                  {(detail.log || []).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{entry.entryType === "containment" ? "Contenção" : entry.entryType === "status_change" ? "Alteração de estado" : "Nota"}</span>
                        <span>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-PT") : ""}</span>
                      </div>
                      <p className="mt-1 text-slate-700">{entry.body}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Adicionar nota" className={adminFieldClass} />
                  <button type="button" disabled={busy || !note.trim()} onClick={handleNote} className={`${adminSecondaryButtonClass} mt-2`}>
                    Adicionar nota
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AdminModal
        open={createOpen}
        title="Registar incidente de segurança"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={adminSecondaryButtonClass}>Cancelar</button>
            <button type="button" disabled={busy || !form.title.trim() || !form.description.trim()} onClick={handleCreate} className={adminButtonClass}>
              {busy ? "A registar..." : "Registar"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Título</span>
            <input type="text" className={adminFieldClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Descrição</span>
            <textarea rows={3} className={adminFieldClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Severidade</span>
            <select className={adminFieldClass} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </label>
        </div>
      </AdminModal>
    </div>
  );
}
