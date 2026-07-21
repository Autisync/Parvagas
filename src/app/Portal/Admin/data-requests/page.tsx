"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  approveDataSubjectRequest,
  fetchDataSubjectRequests,
  rejectDataSubjectRequest,
  type DataSubjectRequestRecord,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminFilterBar,
  AdminPageHeader,
  AdminSpinner,
  adminButtonClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import { useAppNotifier } from "@/app/components/AppNotifier";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "completed", label: "Concluídos" },
  { key: "rejected", label: "Rejeitados" },
  { key: "", label: "Todos" },
];

const TYPE_LABEL: Record<string, string> = { export: "Exportação", erasure: "Eliminação" };

const STATUS_TONE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_LABEL: Record<string, string> = { pending: "Pendente", completed: "Concluído", rejected: "Rejeitado" };

export default function AdminDataRequestsPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [requests, setRequests] = useState<DataSubjectRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchDataSubjectRequests(token, statusFilter || undefined);
      setRequests(res.requests || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível carregar os pedidos."));
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (request: DataSubjectRequestRecord) => {
    if (!token) return;
    if (!window.confirm(
      `Aprovar a eliminação da conta de ${request.requester?.fullName || request.requester?.email || "este utilizador"}? Os dados pessoais serão anonimizados de forma irreversível.`
    )) {
      return;
    }
    setBusyId(request.id);
    try {
      await approveDataSubjectRequest(token, request.id);
      notify("Pedido aprovado — conta anonimizada.", "success");
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível aprovar o pedido."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request: DataSubjectRequestRecord) => {
    if (!token || !rejectNote.trim()) return;
    setBusyId(request.id);
    try {
      await rejectDataSubjectRequest(token, request.id, rejectNote.trim());
      notify("Pedido rejeitado.", "success");
      setRejectingId(null);
      setRejectNote("");
      load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Não foi possível rejeitar o pedido."), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Legal & Conformidade"
        title="Pedidos de Dados (DSAR)"
        description="Pedidos de exportação e eliminação de dados pessoais submetidos pelos utilizadores (direito de acesso e ao esquecimento — RGPD / Lei n.º 22/11)."
      />

      <AdminFilterBar>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === tab.key ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </AdminFilterBar>

      {error && <AdminAlert tone="error">{error}</AdminAlert>}

      {loading ? (
        <div className="flex justify-center py-12"><AdminSpinner size="md" /></div>
      ) : requests.length === 0 ? (
        <AdminEmptyState title="Sem pedidos" description="Não existem pedidos de dados neste filtro." />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {request.requester?.fullName || "Utilizador"} · {request.requester?.email || "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {TYPE_LABEL[request.requestType]} · {request.createdAt ? new Date(request.createdAt).toLocaleString("pt-PT") : ""}
                  </p>
                  {request.note && <p className="mt-2 text-sm text-slate-600">Motivo: {request.note}</p>}
                  {request.adminNote && <p className="mt-1 text-sm text-slate-500">Nota do admin: {request.adminNote}</p>}
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[request.status]}`}>
                  {STATUS_LABEL[request.status]}
                </span>
              </div>

              {request.status === "pending" && request.requestType === "erasure" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => handleApprove(request)}
                    className={adminButtonClass}
                  >
                    Aprovar eliminação
                  </button>
                  {rejectingId === request.id ? (
                    <>
                      <input
                        type="text"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Motivo da rejeição (obrigatório)"
                        className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                      <button
                        type="button"
                        disabled={busyId === request.id || !rejectNote.trim()}
                        onClick={() => handleReject(request)}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Confirmar rejeição
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRejectingId(request.id); setRejectNote(""); }}
                      className={adminSecondaryButtonClass}
                    >
                      Rejeitar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
