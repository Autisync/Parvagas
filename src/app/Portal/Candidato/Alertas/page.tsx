"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";


type Alert = {
  _id: string;
  keyword?: string;
  category?: string;
  location?: string;
  jobType?: string;
  salaryRange?: string;
  frequency?: "immediate" | "daily" | "weekly";
  createdAt?: string;
  active?: boolean;
};

type AlertForm = {
  keyword: string;
  category: string;
  location: string;
  jobType: string;
  salaryRange: string;
  frequency: "immediate" | "daily" | "weekly";
};

const initialForm: AlertForm = {
  keyword: "",
  category: "",
  location: "",
  jobType: "",
  salaryRange: "",
  frequency: "daily",
};

export default function AlertasPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AlertForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { notify } = useAppNotifier();

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    setFetching(true);
    try {
      const data = await authFetch<{ alerts: Alert[] }>("/candidates/alerts?page=1&limit=20", token);
      setAlerts(data.alerts || []);
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao carregar alertas.");
    } finally {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("erro") ? "error" : "success");
    setMessage("");
  }, [message, notify]);

  const validateForm = () => {
    if (!form.keyword && !form.category && !form.location && !form.jobType) {
      setMessage("Defina pelo menos keyword, categoria, localização ou tipo de trabalho.");
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (editingId) {
        const res = await authFetch<{ alert: Alert }>(`/candidates/alerts/${editingId}`, token!, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        setAlerts((prev) => prev.map((item) => (item._id === editingId ? res.alert : item)));
        setMessage("Alerta atualizado.");
      } else {
        const res = await authFetch<{ alert: Alert }>("/candidates/alerts", token!, {
          method: "POST",
          body: JSON.stringify(form),
        });
        setAlerts((prev) => [res.alert, ...prev]);
        setMessage("Alerta criado.");
      }
      resetForm();
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao guardar alerta.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (alert: Alert) => {
    setEditingId(alert._id);
    setForm({
      keyword: alert.keyword || "",
      category: alert.category || "",
      location: alert.location || "",
      jobType: alert.jobType || "",
      salaryRange: alert.salaryRange || "",
      frequency: alert.frequency || "daily",
    });
    setMessage("");
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setMessage("");
    try {
      await authFetch(`/candidates/alerts/${id}`, token!, { method: "DELETE" });
      setAlerts((prev) => prev.filter((a) => a._id !== id));
      setMessage("Alerta eliminado.");
    } catch (err: unknown) {
      setMessage((err as Error).message || "Erro ao eliminar alerta.");
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Alertas de Emprego</h1>
        <p className="mt-2 text-slate-600">Crie, edite e elimine alertas para receber oportunidades relevantes.</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-bold text-slate-900">{editingId ? "Editar alerta" : "Novo alerta"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-700">Keyword</span>
            <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400" value={form.keyword} onChange={(e) => setForm((p) => ({ ...p, keyword: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Category</span>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Location</span>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Job type</span>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={form.jobType} onChange={(e) => setForm((p) => ({ ...p, jobType: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Salary range</span>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={form.salaryRange} onChange={(e) => setForm((p) => ({ ...p, salaryRange: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-700">Frequency</span>
              <select className="w-full rounded-xl border border-gray-200 px-3 py-2" value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as AlertForm["frequency"] }))}>
                <option value="immediate">Immediate</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? "A guardar..." : editingId ? "Atualizar alerta" : "Criar alerta"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm hover:bg-gray-50">
                Cancelar edição
              </button>
            ) : null}
          </div>
        </form>

        <div className="space-y-3">
          {alerts.length === 0 ? <p className="text-sm text-gray-500">Sem alertas configurados.</p> : null}
          {alerts.map((alert) => (
            <article key={alert._id} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{alert.keyword || "Sem keyword"}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {[alert.category, alert.location, alert.jobType, alert.salaryRange, alert.frequency].filter(Boolean).join(" • ")}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Criado em {alert.createdAt ? new Date(alert.createdAt).toLocaleDateString("pt-AO") : "-"}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => startEdit(alert)} className="rounded border px-2 py-1">Editar</button>
                  {confirmDeleteId === alert._id ? (
                    <>
                      <button onClick={() => handleDelete(alert._id)} disabled={deleting === alert._id} className="rounded border border-red-200 px-2 py-1 text-red-600">
                        {deleting === alert._id ? "..." : "Confirmar"}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="rounded border px-2 py-1">Cancelar</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(alert._id)} className="rounded border px-2 py-1 text-red-600">
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
    </div>
  );
}
