"use client";

import { useEffect, useState } from "react";
import { authFetch, authFetchRaw, getToken, getUser } from "@/lib/api";

type InterviewStory = { situation: string; task: string; action: string; result: string };

type Tool = "cv" | "interview" | "cover" | "company";

export default function JobPrepPanel({ jobId }: { jobId: string }) {
  const [isCandidate, setIsCandidate] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [openTool, setOpenTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [stories, setStories] = useState<InterviewStory[] | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState("");

  useEffect(() => {
    const user = getUser() as { role?: string } | null;
    setIsCandidate(Boolean(user && user.role === "candidate"));
    setTokenState(getToken());
  }, []);

  if (!isCandidate || !token) return null;

  const exportTailoredCv = async (format: "pdf" | "docx") => {
    setExportingFormat(format);
    setError("");
    try {
      const res = await authFetchRaw(`/candidates/cv/export?format=${format}&targetJobId=${jobId}`, token);
      if (!res.ok) throw new Error("Não foi possível gerar o CV.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cv-adaptado.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o CV.");
    } finally {
      setExportingFormat(null);
    }
  };

  const runTool = async (tool: Tool) => {
    setOpenTool(tool);
    setError("");
    setUnavailableReason("");
    if (tool === "cv") return;

    setLoading(true);
    try {
      if (tool === "interview") {
        const data = await authFetch<{ stories: InterviewStory[]; unavailable: boolean; reason?: string }>(
          "/candidates/premium/interview-prep", token, { method: "POST", body: JSON.stringify({ jobId }) },
        );
        setStories(data.stories);
        if (data.unavailable) setUnavailableReason(data.reason || "Indisponível de momento.");
      } else if (tool === "cover") {
        const data = await authFetch<{ coverLetter: string; unavailable: boolean; reason?: string }>(
          "/candidates/premium/cover-letter", token, { method: "POST", body: JSON.stringify({ jobId }) },
        );
        setCoverLetter(data.coverLetter);
        if (data.unavailable) setUnavailableReason(data.reason || "Indisponível de momento.");
      } else if (tool === "company") {
        const data = await authFetch<{ snapshot: string; unavailable: boolean; reason?: string }>(
          `/candidates/premium/company-snapshot/${jobId}`, token,
        );
        setSnapshot(data.snapshot);
        if (data.unavailable) setUnavailableReason(data.reason || "Indisponível de momento.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o pedido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-card p-5">
      <h3 className="mb-3 font-bold text-lg">Preparar candidatura</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <button type="button" onClick={() => setOpenTool(openTool === "cv" ? null : "cv")} className="rounded-lg border border-slate-200 px-3 py-2 font-medium hover:bg-slate-50">
          CV adaptado
        </button>
        <button type="button" onClick={() => runTool("interview")} className="rounded-lg border border-slate-200 px-3 py-2 font-medium hover:bg-slate-50">
          Preparar entrevista
        </button>
        <button type="button" onClick={() => runTool("cover")} className="rounded-lg border border-slate-200 px-3 py-2 font-medium hover:bg-slate-50">
          Carta de apresentação
        </button>
        <button type="button" onClick={() => runTool("company")} className="rounded-lg border border-slate-200 px-3 py-2 font-medium hover:bg-slate-50">
          Sobre a empresa
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-[var(--danger-600)]">{error}</p>}

      {openTool === "cv" && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-600">Descarregue o seu CV com resumo e competências adaptados a esta vaga.</p>
          <div className="flex gap-2">
            <button type="button" disabled={!!exportingFormat} onClick={() => exportTailoredCv("pdf")} className="app-btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
              {exportingFormat === "pdf" ? "A gerar..." : "Descarregar PDF"}
            </button>
            <button type="button" disabled={!!exportingFormat} onClick={() => exportTailoredCv("docx")} className="app-btn-secondary px-3 py-1.5 text-xs disabled:opacity-60">
              {exportingFormat === "docx" ? "A gerar..." : "Descarregar DOCX"}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="mt-3 text-xs text-slate-500">A preparar...</p>}

      {!loading && openTool === "interview" && stories && (
        <div className="mt-3 space-y-2">
          {unavailableReason && <p className="text-xs text-amber-700">{unavailableReason}</p>}
          {stories.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 text-xs">
              <p><strong>Situação:</strong> {s.situation}</p>
              <p><strong>Tarefa:</strong> {s.task}</p>
              <p><strong>Ação:</strong> {s.action}</p>
              <p><strong>Resultado:</strong> {s.result}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && openTool === "cover" && (
        <div className="mt-3">
          {unavailableReason && <p className="text-xs text-amber-700">{unavailableReason}</p>}
          {coverLetter && <p className="whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-xs">{coverLetter}</p>}
        </div>
      )}

      {!loading && openTool === "company" && (
        <div className="mt-3">
          {unavailableReason && <p className="text-xs text-amber-700">{unavailableReason}</p>}
          {snapshot && <p className="rounded-lg border border-slate-200 p-3 text-xs">{snapshot}</p>}
        </div>
      )}
    </div>
  );
}
