"use client";

import { useEffect, useState } from "react";
import { authFetch, getErrorMessage, getToken } from "@/lib/api";

type Category = { key: string; label: string };

export default function DisputePaymentForm({ submitPath }: { submitPath: string }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("other");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || categories.length > 0) return;
    authFetch<{ categories: Category[] }>("/account/dispute-categories", "", { suppressGlobalErrors: true })
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, [open, categories.length]);

  const handleSubmit = async () => {
    const token = getToken();
    if (!token || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await authFetch(submitPath, token, {
        method: "POST",
        body: JSON.stringify({ category, reason: reason.trim() }),
      });
      setMessage("Reclamação submetida. Vai receber uma confirmação por email dentro de instantes.");
      setReason("");
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível submeter a reclamação."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Contestar pagamento
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">Contestar o pagamento mais recente</p>
      <label className="mt-2 block text-xs font-medium text-slate-600">
        Motivo
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {categories.length === 0 ? (
            <option value="other">Outro motivo</option>
          ) : (
            categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)
          )}
        </select>
      </label>
      <label className="mt-2 block text-xs font-medium text-slate-600">
        Descreva o problema
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          placeholder="Ex.: fui cobrado duas vezes pelo mesmo plano"
        />
      </label>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !reason.trim()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "A submeter..." : "Submeter reclamação"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">
          Cancelar
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
