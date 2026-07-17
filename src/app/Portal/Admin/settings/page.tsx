"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  AdminPermissions,
  fetchAdminMe,
  fetchFeatureFlags,
  hasPermission,
  toDateLabel,
  updateFeatureFlag,
  type AdminMe,
  type FeatureFlagRecord,
} from "../adminClient";
import { AdminPageHeader, AdminRestricted } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

export default function AdminSettingsPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [flags, setFlags] = useState<FeatureFlagRecord[]>([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canManage = useMemo(() => hasPermission(me, AdminPermissions.FEATURE_FLAGS_MANAGE), [me]);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [currentAdmin, flagsRes] = await Promise.all([fetchAdminMe(token), fetchFeatureFlags(token)]);
      setMe(currentAdmin);
      setFlags(flagsRes.featureFlags || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar configuração."));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFlag = async (flag: FeatureFlagRecord) => {
    if (!token || !canManage) return;
    setBusyKey(flag.key);
    try {
      const updated = await updateFeatureFlag(token, flag.key, !flag.value);
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? updated : f)));
      notify(`${flag.key} ${updated.value ? "ativado" : "desativado"}.`, "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar a funcionalidade."), "error");
    } finally {
      setBusyKey(null);
    }
  };

  if (me && !canManage) {
    return (
      <AdminRestricted title="Acesso restrito">
        Não tem permissão para gerir a configuração da plataforma.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Plataforma"
        title="Definições"
        description="Interruptores de decisão de negócio — ativar/desativar sem precisar de redeploy."
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <section className="mt-6 space-y-3">
        {flags.map((flag) => (
          <article key={flag.key} className="app-card flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-slate-900">{flag.key}</p>
              {flag.description ? <p className="mt-1 text-sm text-slate-600">{flag.description}</p> : null}
              {flag.updatedAt ? <p className="mt-1 text-xs text-slate-400">Atualizado em {toDateLabel(flag.updatedAt)}</p> : null}
            </div>
            <button
              type="button"
              disabled={busyKey === flag.key}
              onClick={() => toggleFlag(flag)}
              className={[
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60",
                flag.value ? "bg-emerald-600" : "bg-slate-300",
              ].join(" ")}
              aria-pressed={flag.value}
              aria-label={`${flag.value ? "Desativar" : "Ativar"} ${flag.key}`}
            >
              <span
                className={[
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                  flag.value ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
