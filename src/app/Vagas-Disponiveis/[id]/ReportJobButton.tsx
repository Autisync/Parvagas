"use client";

import { useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

const REASONS = [
  "Vaga falsa ou enganosa",
  "Pede pagamento ao candidato",
  "Contacto fora da plataforma",
  "Conteúdo ofensivo ou spam",
];

export default function ReportJobButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setState("sending");
    setError("");
    try {
      await apiFetch(`/jobs/${jobId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
        suppressGlobalErrors: true,
      });
      setState("done");
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível enviar a denúncia."));
      setState("idle");
    }
  };

  if (state === "done") {
    return <p className="text-xs text-[var(--success-700)]">✓ Obrigado. A denúncia foi enviada para revisão.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--text-subtle)] hover:text-[var(--danger-600)] hover:underline">
        ⚑ Denunciar esta vaga
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
      <p className="mb-2 text-xs font-semibold text-[var(--text-strong)]">Porque está a denunciar esta vaga?</p>
      <select className="app-input mb-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {error && <p className="mb-2 text-xs text-[var(--danger-600)]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={state === "sending"} className="app-btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
          {state === "sending" ? "A enviar..." : "Enviar denúncia"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="app-btn-secondary px-3 py-1.5 text-xs">Cancelar</button>
      </div>
    </div>
  );
}
