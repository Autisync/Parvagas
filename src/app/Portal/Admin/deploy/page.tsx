"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchDeployDiff,
  fetchDeployHistory,
  triggerDeploy,
  type DeployCommit,
  type DeployDiff,
  type DeployHistoryItem,
} from "../adminClient";
import { AdminPageHeader, AdminRestricted, adminButtonClass } from "../components/AdminUI";

// ── helpers ──────────────────────────────────────────────────────────────────

function toDateLabel(iso?: string) {
  if (!iso) return "--";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function CommitRow({ c }: { c: DeployCommit }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <code className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-600">{c.hash}</code>
      <span className="truncate text-sm text-slate-800">{c.message}</span>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function AdminDeployPage() {
  const { token, user } = useAuth("admin");
  const isSuper = user?.adminLevel === "super-admin";

  const [diff, setDiff] = useState<DeployDiff | null>(null);
  const [history, setHistory] = useState<DeployHistoryItem[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [reason, setReason] = useState("");
  const [deployResult, setDeployResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState("");

  const loadDiff = useCallback(async () => {
    if (!token) return;
    setLoadingDiff(true);
    setError("");
    try {
      const data = await fetchDeployDiff(token);
      setDiff(data);
    } catch (e) {
      setError((e as Error).message || "Erro ao carregar diff.");
    } finally {
      setLoadingDiff(false);
    }
  }, [token]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const data = await fetchDeployHistory(token);
      setHistory(data.history || []);
    } catch {
      /* non-critical */
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    loadDiff();
    loadHistory();
  }, [loadDiff, loadHistory]);

  const handleDeploy = async () => {
    if (!token || deploying) return;
    if (!confirm("Confirmar deploy para PRODUÇÃO?")) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await triggerDeploy(token, reason || "Deploy via admin panel");
      setDeployResult({ ok: true, msg: res.detail });
      loadDiff();
      loadHistory();
    } catch (e) {
      setDeployResult({ ok: false, msg: (e as Error).message || "Deploy falhou." });
    } finally {
      setDeploying(false);
    }
  };

  if (!isSuper) {
    return (
      <AdminRestricted title="Acesso restrito">
        Apenas super-admin pode aceder ao painel de deploy.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Release"
        title="Deploy para Produção"
        description="Visualize as alterações pendentes e lance uma nova versão para o servidor de produção."
      />

      {/* ── Refresh ── */}
      <div className="mb-6 flex gap-3">
        <button type="button" onClick={() => { loadDiff(); loadHistory(); }} disabled={loadingDiff} className={adminButtonClass}>
          {loadingDiff ? "A verificar…" : "↻ Actualizar"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {/* ── Status banner ── */}
      {diff && !diff.error && (
        <div className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${
          diff.commits_ahead === 0
            ? "border-emerald-200 bg-emerald-50"
            : diff.dirty_files.length > 0
            ? "border-amber-200 bg-amber-50"
            : "border-blue-200 bg-blue-50"
        }`}>
          <div className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
            diff.commits_ahead === 0 ? "bg-emerald-500" : diff.dirty_files.length > 0 ? "bg-amber-500" : "bg-blue-500"
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              diff.commits_ahead === 0 ? "text-emerald-800" : diff.dirty_files.length > 0 ? "text-amber-800" : "text-blue-800"
            }`}>
              {diff.commits_ahead === 0
                ? "Produção está actualizada."
                : diff.dirty_files.length > 0
                ? `${diff.commits_ahead} commit(s) pendentes + ${diff.dirty_files.length} ficheiro(s) não comitados.`
                : `${diff.commits_ahead} commit(s) prontos para deploy.`}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Branch: <code className="font-mono">{diff.branch}</code> · Último commit: {diff.last_commit?.hash} — {diff.last_commit?.message} ({diff.last_commit?.when})
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Pending commits ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">
            Commits pendentes
            {diff && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{diff.commits_ahead}</span>}
          </h2>

          {loadingDiff ? (
            <p className="text-sm text-slate-400">A carregar…</p>
          ) : !diff?.commits?.length ? (
            <p className="text-sm text-slate-500">Nenhum commit por enviar.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {diff.commits.map((c) => <CommitRow key={c.hash} c={c} />)}
            </div>
          )}

          {diff?.diff_stat && (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-300 whitespace-pre-wrap">
              {diff.diff_stat}
            </pre>
          )}

          {/* Dirty files warning */}
          {diff && diff.dirty_files.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">⚠ Ficheiros não comitados ({diff.dirty_files.length})</p>
              <ul className="mt-1 space-y-0.5">
                {diff.dirty_files.slice(0, 10).map((f) => (
                  <li key={f} className="font-mono text-xs text-amber-700">{f}</li>
                ))}
                {diff.dirty_files.length > 10 && <li className="text-xs text-amber-600">+{diff.dirty_files.length - 10} mais…</li>}
              </ul>
            </div>
          )}
        </div>

        {/* ── Deploy trigger ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Lançar para Produção</h2>

          <label className="block text-xs font-medium text-slate-600 mb-1">
            Motivo / nota de release <span className="text-slate-400">(opcional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: hotfix login, feature flags, v1.2.0…"
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder-slate-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 resize-none"
          />

          <button
            type="button"
            onClick={handleDeploy}
            disabled={deploying || !diff?.ready_to_deploy}
            className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all ${
              deploying || !diff?.ready_to_deploy
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-red-600 text-white hover:bg-red-700 shadow hover:shadow-md active:scale-[0.98]"
            }`}
          >
            {deploying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                A lançar…
              </span>
            ) : diff?.ready_to_deploy ? (
              `Deploy ${diff.commits_ahead} commit(s) → Produção`
            ) : diff?.commits_ahead === 0 ? (
              "Produção já actualizada"
            ) : (
              "Confirmar ficheiros não comitados antes de lançar"
            )}
          </button>

          {deployResult && (
            <div className={`mt-3 rounded-xl border p-3 text-sm ${
              deployResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}>
              {deployResult.ok ? "✓ " : "✕ "}{deployResult.msg}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            O deploy chama o webhook do Portainer (ou <code className="font-mono">git push</code>) configurado em <code className="font-mono">DEPLOY_WEBHOOK_URL</code>. Cada lançamento fica registado no log de auditoria.
          </p>
        </div>
      </div>

      {/* ── Deploy history ── */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Histórico de deploys</h2>
        {loadingHistory ? (
          <p className="text-sm text-slate-400">A carregar…</p>
        ) : !history.length ? (
          <p className="text-sm text-slate-500">Nenhum deploy registado ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full ${h.action === "deploy.push" ? "bg-emerald-500" : "bg-rose-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {h.action === "deploy.push" ? "Deploy concluído" : "Deploy falhou"}
                    <span className="ml-2 text-xs font-normal text-slate-500">por {h.actor}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{h.details.reason || h.details.result || h.details.error || "—"}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-400">{toDateLabel(h.created_at)}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
