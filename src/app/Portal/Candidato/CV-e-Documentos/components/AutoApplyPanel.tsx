"use client";

import type { AutoApplyProposal } from "./types";
import { JOB_CATEGORIES, categoryLabels } from "./constants";

type AutoApplyPanelProps = {
  preferredCategories: string[];
  autoApplyOptIn: boolean;
  savingAutoApply: boolean;
  onToggleCategory: (category: string) => void;
  onToggleOptIn: () => void;
  onSavePrefs: () => void;
  proposals: AutoApplyProposal[];
  loadingProposals: boolean;
  reviewingId: string | null;
  onReviewProposal: (proposalId: string, action: "approve" | "dismiss") => void;
};

export default function AutoApplyPanel({
  preferredCategories,
  autoApplyOptIn,
  savingAutoApply,
  onToggleCategory,
  onToggleOptIn,
  onSavePrefs,
  proposals,
  loadingProposals,
  reviewingId,
  onReviewProposal,
}: AutoApplyPanelProps) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-900">Candidatura automática por área</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Escolha as áreas do seu interesse. Avisamo-lo quando surgir uma vaga compatível — a candidatura só é
            submetida depois de a aprovar abaixo.
          </p>
          <p className="mt-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
            Funcionalidade paga (em breve). Por agora, reveja e aprove sugestões sem custo.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleOptIn}
          disabled={savingAutoApply}
          aria-label="Ativar candidatura automática"
          aria-pressed={autoApplyOptIn}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${autoApplyOptIn ? "bg-red-600" : "bg-slate-200"}`}
        >
          <span className={`m-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${autoApplyOptIn ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {JOB_CATEGORIES.map((category) => {
          const selected = preferredCategories.includes(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => onToggleCategory(category)}
              aria-pressed={selected}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                selected
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {categoryLabels[category] || category}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSavePrefs}
        disabled={savingAutoApply}
        className="mt-4 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        {savingAutoApply ? "A guardar..." : "Guardar áreas de interesse"}
      </button>

      {autoApplyOptIn && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-bold text-slate-900">Sugestões para rever</h3>
          {loadingProposals ? (
            <p className="mt-2 text-sm text-slate-500">A carregar sugestões...</p>
          ) : proposals.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Sem sugestões de momento. Verificamos vagas novas nas suas áreas periodicamente.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {proposals.map((proposal) => {
                const company =
                  proposal.job?.companyId && typeof proposal.job.companyId === "object"
                    ? proposal.job.companyId.name
                    : "Empresa";
                const busy = reviewingId === proposal._id;
                return (
                  <article key={proposal._id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{proposal.job?.title || "Vaga"}</p>
                        <p className="text-xs text-slate-500">
                          {company} {proposal.job?.location ? `• ${proposal.job.location}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                        {proposal.matchScore}% compatível
                      </span>
                    </div>
                    {proposal.matchReasons?.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                        {proposal.matchReasons.map((reason, i) => (
                          <li key={i}>• {reason}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReviewProposal(proposal._id, "approve")}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {busy ? "A processar..." : "Aprovar e candidatar"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReviewProposal(proposal._id, "dismiss")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Dispensar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
