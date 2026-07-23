"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { authFetch, ApiError, getErrorMessage } from "@/lib/api";

type ApiKeyRecord = {
  _id: string;
  label: string | null;
  keyPrefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CompanyApiKeysCard({ token }: { token: string }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);

  const loadKeys = () => {
    setFetching(true);
    authFetch<{ apiKeys: ApiKeyRecord[] }>("/company-api/keys", token, { suppressGlobalErrors: true })
      .then((d) => setKeys(d.apiKeys || []))
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    setQuotaExceeded(false);
    try {
      const res = await authFetch<{ apiKey: ApiKeyRecord; rawKey: string }>("/company-api/keys", token, {
        method: "POST",
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      setRawKey(res.rawKey);
      setLabel("");
      loadKeys();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível gerar a chave API."));
      setQuotaExceeded(err instanceof ApiError && err.status === 402);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Revogar esta chave API? Qualquer integração que a use deixará de funcionar imediatamente.")) return;
    try {
      await authFetch(`/company-api/keys/${id}`, token, { method: "DELETE" });
      loadKeys();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Não foi possível revogar a chave."));
    }
  };

  if (fetching) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <KeyIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Chave API</h2>
          <p className="mt-1 text-sm text-slate-600">
            Gere uma chave para sincronizar as candidaturas da sua empresa com o seu próprio ATS/HRIS. Apenas leitura —{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">GET /api/v1/company-api/applications</code>.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
          {quotaExceeded && (
            <Link href="/Portal/Empresa/Planos" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
              Fazer upgrade do plano
            </Link>
          )}
        </div>
      )}

      {rawKey && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Esta chave só é mostrada uma vez — guarde-a num local seguro.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-700">{rawKey}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(rawKey)}
              className="shrink-0 rounded-lg border border-amber-300 p-2 text-amber-700 hover:bg-amber-100"
              title="Copiar"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={() => setRawKey(null)} className="mt-2 text-xs font-semibold text-amber-800 hover:underline">
            Já guardei — fechar
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nome da chave (opcional, ex.: Integração Zapier)"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "A gerar..." : "Gerar nova chave"}
        </button>
      </div>

      {keys.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {keys.map((k) => (
            <li key={k._id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <span className="font-medium text-slate-800">{k.label || "Sem nome"}</span>{" "}
                <code className="text-xs text-slate-500">{k.keyPrefix}…</code>
                <p className="text-xs text-slate-500">
                  Criada {formatDate(k.createdAt)} · Último uso {formatDate(k.lastUsedAt)}
                  {k.revokedAt ? ` · Revogada ${formatDate(k.revokedAt)}` : ""}
                </p>
              </div>
              {!k.revokedAt && (
                <button
                  type="button"
                  onClick={() => handleRevoke(k._id)}
                  className="shrink-0 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Revogar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
