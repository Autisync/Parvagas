"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

type Application = {
  _id: string;
  status: string;
  profileSnapshot?: { fullName?: string; email?: string };
  jobId?: { title?: string } | null;
};

type AtsStage = {
  id: string;
  name: string;
  position: number;
};

type AtsPipelineItem = {
  id: string;
  application_id?: string | null;
  stage_id: string;
};

/** Click-based Kanban board over the ATS pipeline — no drag-and-drop, a
 * "Mover para" dropdown on each card instead. Stages auto-seed server-side
 * on first load (GET /ats/stages), and every new application auto-creates
 * a pipeline item in the first stage, so this is never an empty board with
 * no way to get started. */
export default function AtsKanbanBoard({ token, applications }: { token: string; applications: Application[] }) {
  const [stages, setStages] = useState<AtsStage[]>([]);
  const [items, setItems] = useState<AtsPipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [stagesRes, itemsRes] = await Promise.all([
        authFetch<AtsStage[]>("/ats/stages", token, { suppressGlobalErrors: true }),
        authFetch<AtsPipelineItem[]>("/ats/pipeline", token, { suppressGlobalErrors: true }),
      ]);
      setStages([...stagesRes].sort((a, b) => a.position - b.position));
      setItems(itemsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar o quadro Kanban.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const moveItem = async (itemId: string, stageId: string) => {
    setMovingId(itemId);
    try {
      await authFetch(`/ats/pipeline/${itemId}/move`, token, {
        method: "PATCH",
        body: JSON.stringify({ stage_id: stageId }),
        suppressGlobalErrors: true,
      });
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, stage_id: stageId } : i)));
    } catch {
      /* board re-fetch on next load will correct any drift */
    } finally {
      setMovingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" /></div>;
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-rose-600">{error}</p>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageItems = items.filter((i) => i.stage_id === stage.id);
        return (
          <div key={stage.id} className="w-72 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{stage.name}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{stageItems.length}</span>
            </div>
            <div className="space-y-2">
              {stageItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400">Sem candidaturas</p>
              ) : (
                stageItems.map((item) => {
                  const application = applications.find((a) => a._id === item.application_id);
                  const name = application?.profileSnapshot?.fullName || "Candidato";
                  const email = application?.profileSnapshot?.email || "";
                  const jobTitle = application?.jobId && typeof application.jobId === "object" ? application.jobId.title : "";
                  return (
                    <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">{name}</p>
                      {email ? <p className="text-xs text-gray-500">{email}</p> : null}
                      {jobTitle ? <p className="mt-1 text-xs text-gray-500">Para: <strong>{jobTitle}</strong></p> : null}
                      <select
                        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs"
                        value={stage.id}
                        disabled={movingId === item.id}
                        onChange={(e) => moveItem(item.id, e.target.value)}
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>Mover para: {s.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
