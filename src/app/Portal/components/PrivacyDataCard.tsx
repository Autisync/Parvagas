"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveBoxArrowDownIcon, TrashIcon } from "@heroicons/react/24/outline";
import { authFetch, getErrorMessage, getToken } from "@/lib/api";

type DataRequest = {
  id: string;
  requestType: "export" | "erasure";
  status: "pending" | "completed" | "rejected";
  note: string | null;
  adminNote: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

const STATUS_LABEL: Record<DataRequest["status"], string> = {
  pending: "Pendente",
  completed: "Concluído",
  rejected: "Rejeitado",
};

const STATUS_CLASS: Record<DataRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function PrivacyDataCard() {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [exporting, setExporting] = useState(false);
  const [requestingErasure, setRequestingErasure] = useState(false);
  const [note, setNote] = useState("");
  const [showErasureForm, setShowErasureForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await authFetch<{ requests: DataRequest[] }>("/account/data-requests", token, {
        suppressGlobalErrors: true,
      });
      setRequests(res.requests || []);
    } catch {
      // Non-critical — the card still works without request history.
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const pendingErasure = requests.find((r) => r.requestType === "erasure" && r.status === "pending");

  const handleExport = async () => {
    const token = getToken();
    if (!token) return;
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const data = await authFetch<Record<string, unknown>>("/account/data-export", token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "parvagas-os-meus-dados.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
      setMessage("Os seus dados foram exportados.");
      loadRequests();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível exportar os seus dados."));
    } finally {
      setExporting(false);
    }
  };

  const handleRequestErasure = async () => {
    const token = getToken();
    if (!token) return;
    if (!window.confirm(
      "Tem a certeza que quer pedir a eliminação da sua conta? Esta ação será revista por um administrador e, uma vez aprovada, é irreversível."
    )) {
      return;
    }
    setRequestingErasure(true);
    setError("");
    setMessage("");
    try {
      await authFetch("/account/erasure-requests", token, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setMessage("Pedido de eliminação submetido. Será revisto por um administrador em breve.");
      setShowErasureForm(false);
      setNote("");
      loadRequests();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível submeter o pedido de eliminação."));
    } finally {
      setRequestingErasure(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <ArchiveBoxArrowDownIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Os meus dados</h2>
          <p className="mt-1 text-sm text-slate-600">
            Exerça os seus direitos de acesso e eliminação de dados pessoais, nos termos da{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-red-600 hover:text-red-700">
              Política de Privacidade
            </a>.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "A exportar..." : "Exportar os meus dados"}
        </button>

        {pendingErasure ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
            Pedido de eliminação pendente de revisão
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowErasureForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            <TrashIcon className="h-4 w-4" />
            Pedir eliminação da conta
          </button>
        )}
      </div>

      {showErasureForm && !pendingErasure && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Motivo (opcional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Ex.: já não uso a plataforma"
            />
          </label>
          <button
            type="button"
            onClick={handleRequestErasure}
            disabled={requestingErasure}
            className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requestingErasure ? "A submeter..." : "Confirmar pedido de eliminação"}
          </button>
        </div>
      )}

      {requests.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {r.requestType === "export" ? "Exportação" : "Eliminação"} —{" "}
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-PT") : ""}
              </span>
              <span className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_CLASS[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </section>
  );
}
