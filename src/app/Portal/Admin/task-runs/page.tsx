"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import { fetchTaskRuns, toDateLabel, type TaskRunSummary, type TaskRunStatus } from "../adminClient";
import { AdminPageHeader, AdminSpinner } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

const statusLabels: Record<TaskRunStatus, string> = {
  never_run: "Nunca executado",
  running: "Em execução",
  success: "Sucesso",
  failed: "Falhou",
};

const statusClasses: Record<TaskRunStatus, string> = {
  never_run: "border-slate-300 bg-slate-100 text-slate-600",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function AdminTaskRunsPage() {
  const { token } = useAuth("admin");
  const [tasks, setTasks] = useState<TaskRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const res = await fetchTaskRuns(token);
      setTasks(res.tasks || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar o estado das tarefas."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Operações"
        title="Estado das Tarefas Agendadas"
        description="Última execução de cada tarefa periódica (celery-beat) — deteta silenciosamente tarefas que pararam de correr."
      />

      {error ? <div className="mt-4"><InlineErrorState message={error} onAction={load} /></div> : null}

      {loading ? (
        <div className="mt-6"><AdminSpinner /></div>
      ) : (
        <section className="mt-6 space-y-3">
          {tasks.map((task) => (
            <article key={task.taskName} className="app-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm font-semibold text-slate-900">{task.taskName}</p>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClasses[task.lastRun.status]}`}>
                  {statusLabels[task.lastRun.status]}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                <p>Início: {task.lastRun.startedAt ? toDateLabel(task.lastRun.startedAt) : "--"}</p>
                <p>Fim: {task.lastRun.finishedAt ? toDateLabel(task.lastRun.finishedAt) : "--"}</p>
              </div>
              {task.lastRun.detail ? (
                <p className="mt-2 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600" title={task.lastRun.detail}>
                  {task.lastRun.detail}
                </p>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
