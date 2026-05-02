"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";

type Prefs = {
  emailJobAlerts?: boolean;
  applicationStatusUpdates?: boolean;
  savedJobReminders?: boolean;
  recommendationUpdates?: boolean;
  marketingNewsletter?: boolean;
};

const defaults: Prefs = {
  emailJobAlerts: true,
  applicationStatusUpdates: true,
  savedJobReminders: false,
  recommendationUpdates: true,
  marketingNewsletter: false,
};

export default function DefinicoesPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    authFetch<{ preferences: Prefs }>("/candidates/notifications/preferences", token)
      .then((d) => setPrefs({ ...defaults, ...(d.preferences || {}) }))
      .catch(() => setMsg("Não foi possível carregar preferências. Usando padrão."))
      .finally(() => setFetching(false));
  }, [token]);

  if (loading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await authFetch("/candidates/notifications/preferences", token!, {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setMsg("Preferências guardadas.");
    } catch (err: unknown) {
      setMsg((err as Error).message || "Erro ao guardar preferências.");
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, desc, k }: { label: string; desc: string; k: keyof Prefs }) => (
    <div className="flex items-center justify-between border-b border-gray-50 py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => toggle(k)}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${prefs[k] ? "bg-red-600" : "bg-slate-200"}`}
      >
        <span className={`m-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${prefs[k] ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Definições</h1>
        <p className="mt-2 text-slate-600">Gerencie as suas preferências de notificação.</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="rounded-lg border border-slate-200 px-6">
          <Row label="Email job alerts" desc="Receber alertas de vagas por email" k="emailJobAlerts" />
          <Row label="Application status updates" desc="Ser avisado de alterações de estado de candidatura" k="applicationStatusUpdates" />
          <Row label="Saved job reminders" desc="Lembretes sobre vagas guardadas" k="savedJobReminders" />
          <Row label="Recommendation updates" desc="Novas recomendações relevantes" k="recommendationUpdates" />
          <Row label="Marketing/newsletter" desc="Novidades e conteúdos da plataforma" k="marketingNewsletter" />
          </div>

          {msg ? <p className={`mt-4 text-sm ${msg.toLowerCase().includes("guardadas") ? "text-green-600" : "text-red-600"}`}>{msg}</p> : null}

          <button type="submit" disabled={saving} className="mt-6 rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">
            {saving ? "A guardar..." : "Guardar preferências"}
          </button>
        </form>
    </div>
  );
}
