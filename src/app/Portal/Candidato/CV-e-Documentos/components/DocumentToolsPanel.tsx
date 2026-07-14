"use client";

import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

type SavedJobOption = { id: string; title: string };

type DocumentToolsPanelProps = {
  targetJobId: string;
  onTargetJobChange: (jobId: string) => void;
  savedJobOptions: SavedJobOption[];
  exporting: string | null;
  onExport: (format: "pdf" | "docx" | "json") => void;
};

const EXPORT_FORMATS = ["pdf", "docx", "json"] as const;

export default function DocumentToolsPanel({
  targetJobId,
  onTargetJobChange,
  savedJobOptions,
  exporting,
  onExport,
}: DocumentToolsPanelProps) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Modelo de CV em branco</p>
          <p className="mt-1 text-xs text-slate-600">Descarregue, preencha offline e depois carregue-o aqui.</p>
        </div>
        <a
          href="/templates/modelo-cv-parvagas.docx"
          download="modelo-cv-parvagas.docx"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
          Descarregar modelo
        </a>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Exportar o seu perfil como CV</p>
            <label className="mt-3 block text-xs text-slate-600">
              Adaptar a uma vaga guardada (opcional)
              <select
                className="mt-1 block w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                value={targetJobId}
                onChange={(e) => onTargetJobChange(e.target.value)}
              >
                <option value="">CV genérico</option>
                {savedJobOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.title}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onExport(fmt)}
                disabled={!!exporting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                {exporting === fmt ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                ) : (
                  <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
                )}
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
