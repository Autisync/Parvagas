"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  addAdminDisputeNote,
  assignAdminDispute,
  closeAdminDisputeNoResponse,
  fetchAdminDispute,
  fetchAdminDisputes,
  refundAdminDispute,
  rejectAdminDispute,
  requestAdminDisputeInfo,
  resolveAdminDispute,
  type DisputeRecord,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminFilterBar,
  AdminPageHeader,
  AdminSpinner,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import { useAppNotifier } from "@/app/components/AppNotifier";

const STATUS_TABS = [
  { key: "", label: "Todas" },
  { key: "open", label: "Abertas" },
  { key: "under_review", label: "Em análise" },
  { key: "responded", label: "Aguarda resposta" },
  { key: "resolved", label: "Resolvidas" },
  { key: "refunded", label: "Reembolsadas" },
  { key: "rejected", label: "Rejeitadas" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta", under_review: "Em análise", responded: "Aguarda resposta",
  resolved: "Resolvida", refunded: "Reembolsada", rejected: "Rejeitada",
};

const STATUS_TONE: Record<string, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  under_review: "border-sky-200 bg-sky-50 text-sky-700",
  responded: "border-violet-200 bg-violet-50 text-violet-700",
  resolved: "border-slate-200 bg-slate-100 text-slate-600",
  refunded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function AdminDisputesPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DisputeRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [documentsRequested, setDocumentsRequested] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [isPartialRefund, setIsPartialRefund] = useState(false);
  const [refundSummary, setRefundSummary] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminDisputes(token, statusFilter || undefined);
      setDisputes(res.disputes || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar as disputas."));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    try {
      const record = await fetchAdminDispute(token, id);
      setDetail(record);
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível carregar a disputa."), "error");
    }
  }, [token, notify]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const refreshAfterAction = async () => {
    await load();
    if (selectedId) await loadDetail(selectedId);
  };

  const runAction = async (fn: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      notify(successMessage, "success");
      await refreshAfterAction();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível concluir a ação."), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = () => selectedId && token && runAction(() => assignAdminDispute(token, selectedId), "Disputa atribuída.");

  const handleRequestInfo = () => {
    if (!selectedId || !token || !documentsRequested.trim()) return;
    runAction(() => requestAdminDisputeInfo(token, selectedId, documentsRequested.trim()), "Pedido de informação enviado (Modelo B).")
      .then(() => setDocumentsRequested(""));
  };

  const handleResolve = () => {
    if (!selectedId || !token || !decisionNote.trim()) return;
    runAction(() => resolveAdminDispute(token, selectedId, decisionNote.trim()), "Disputa resolvida sem alteração de valor.")
      .then(() => setDecisionNote(""));
  };

  const handleRefund = () => {
    if (!selectedId || !token) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0 || !refundSummary.trim()) return;
    if (!window.confirm(`Confirmar reembolso de ${amount.toLocaleString("pt-PT")}${isPartialRefund ? " (parcial)" : " (total)"}? ${!isPartialRefund ? "O acesso do utilizador será revogado de imediato." : ""}`)) return;
    runAction(
      () => refundAdminDispute(token, selectedId, { refundAmount: amount, isPartial: isPartialRefund, summary: refundSummary.trim() }),
      "Reembolso processado.",
    ).then(() => { setRefundAmount(""); setRefundSummary(""); setIsPartialRefund(false); });
  };

  const handleReject = () => {
    if (!selectedId || !token || !rejectionReason.trim()) return;
    runAction(() => rejectAdminDispute(token, selectedId, rejectionReason.trim()), "Disputa rejeitada (Modelo E).")
      .then(() => setRejectionReason(""));
  };

  const handleCloseNoResponse = () => selectedId && token && runAction(
    () => closeAdminDisputeNoResponse(token, selectedId), "Disputa encerrada por falta de resposta (Modelo F).",
  );

  const handleAddNote = () => {
    if (!selectedId || !token || !internalNote.trim()) return;
    runAction(() => addAdminDisputeNote(token, selectedId, internalNote.trim()), "Nota interna adicionada.")
      .then(() => setInternalNote(""));
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Negócio"
        title="Disputas de Pagamento"
        description="Reclamações sobre transações — fluxo de resolução definido na Política de Fluxo de Resolução de Disputas de Pagamento (documento interno). Não existe chargeback bancário nos meios de pagamento locais; toda a disputa é aberta e resolvida diretamente aqui."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <AdminFilterBar>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === tab.key ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </AdminFilterBar>

          {error && <AdminAlert tone="error">{error}</AdminAlert>}

          {loading ? (
            <div className="mt-4 flex justify-center py-8"><AdminSpinner size="md" /></div>
          ) : disputes.length === 0 ? (
            <div className="mt-4"><AdminEmptyState title="Sem disputas" description="Não existem disputas neste filtro." /></div>
          ) : (
            <div className="mt-4 space-y-2">
              {disputes.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === d.id ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{d.filedBy?.fullName || d.filedBy?.email || "—"}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[d.status]}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {d.transactionReference} · {d.amount?.toLocaleString("pt-PT")} {d.currency}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{d.createdAt ? new Date(d.createdAt).toLocaleDateString("pt-PT") : ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!detail ? (
            <AdminEmptyState title="Selecione uma disputa" description="Escolha uma disputa na lista para ver detalhes e agir." />
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{detail.filedBy?.fullName} · {detail.filedBy?.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Transação {detail.transactionReference} · {detail.amount?.toLocaleString("pt-PT")} {detail.currency} · categoria: {detail.category}
                    </p>
                    {detail.assignedAdmin && <p className="mt-1 text-xs text-slate-500">Atribuída a {detail.assignedAdmin.fullName}</p>}
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-700">{detail.reason}</p>
                {detail.decisionNote && <p className="mt-2 text-sm text-slate-500">Decisão: {detail.decisionNote}</p>}
                {detail.refundAmount != null && <p className="mt-1 text-sm text-emerald-700">Reembolsado: {detail.refundAmount.toLocaleString("pt-PT")} {detail.currency}</p>}

                {detail.status === "open" && (
                  <button type="button" disabled={busy} onClick={handleAssign} className={`${adminButtonClass} mt-4`}>
                    Atribuir a mim / iniciar análise
                  </button>
                )}
              </div>

              {["under_review", "responded"].includes(detail.status) && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Pedir informação adicional (Modelo B)</h3>
                  <textarea
                    value={documentsRequested}
                    onChange={(e) => setDocumentsRequested(e.target.value)}
                    rows={2}
                    placeholder="Ex.: comprovativo de pagamento (referência e data)"
                    className={`${adminFieldClass} mt-2`}
                  />
                  <button type="button" disabled={busy || !documentsRequested.trim()} onClick={handleRequestInfo} className={`${adminSecondaryButtonClass} mt-2`}>
                    Enviar pedido
                  </button>
                </div>
              )}

              {detail.status === "responded" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Sem resposta do utilizador</h3>
                  <p className="mt-1 text-xs text-slate-500">Encerra a disputa (Modelo F) — use após o prazo de 10 dias úteis sem resposta.</p>
                  <button type="button" disabled={busy} onClick={handleCloseNoResponse} className={`${adminSecondaryButtonClass} mt-2`}>
                    Encerrar por falta de resposta
                  </button>
                </div>
              )}

              {["under_review", "responded"].includes(detail.status) && (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Resolver sem alteração de valor</h3>
                    <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} placeholder="Motivo / esclarecimento aceite" className={`${adminFieldClass} mt-2`} />
                    <button type="button" disabled={busy || !decisionNote.trim()} onClick={handleResolve} className={`${adminSecondaryButtonClass} mt-2`}>
                      Marcar como resolvida
                    </button>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Reembolsar (Modelo C/D)</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Montante" className={adminFieldClass} />
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={isPartialRefund} onChange={(e) => setIsPartialRefund(e.target.checked)} />
                        Reembolso parcial
                      </label>
                    </div>
                    <textarea value={refundSummary} onChange={(e) => setRefundSummary(e.target.value)} rows={2} placeholder="Resumo da conclusão / justificação" className={`${adminFieldClass} mt-2`} />
                    <p className="mt-1 text-xs text-slate-500">Um reembolso total revoga o acesso de imediato; um reembolso parcial não altera o acesso.</p>
                    <button type="button" disabled={busy || !refundAmount || !refundSummary.trim()} onClick={handleRefund} className={`${adminButtonClass} mt-2`}>
                      Processar reembolso
                    </button>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">Rejeitar (Modelo E)</h3>
                    <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} placeholder="Motivo fundamentado na Política de Reembolsos" className={`${adminFieldClass} mt-2`} />
                    <button
                      type="button"
                      disabled={busy || !rejectionReason.trim()}
                      onClick={handleReject}
                      className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rejeitar disputa
                    </button>
                  </div>
                </>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">Histórico</h3>
                <div className="mt-3 space-y-3">
                  {(detail.messages || []).map((m) => (
                    <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.isInternalNote ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{m.isInternalNote ? "Nota interna" : `Modelo ${m.templateCode || "—"} · enviado ao utilizador`}</span>
                        <span>{m.createdAt ? new Date(m.createdAt).toLocaleString("pt-PT") : ""}</span>
                      </div>
                      {m.subject && <p className="mt-1 font-medium text-slate-800">{m.subject}</p>}
                      {m.isInternalNote ? (
                        <p className="mt-1 text-slate-700">{m.body}</p>
                      ) : (
                        <div className="mt-1 text-slate-700" dangerouslySetInnerHTML={{ __html: m.body }} />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} placeholder="Adicionar nota interna (não visível ao utilizador)" className={adminFieldClass} />
                  <button type="button" disabled={busy || !internalNote.trim()} onClick={handleAddNote} className={`${adminSecondaryButtonClass} mt-2`}>
                    Adicionar nota
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
