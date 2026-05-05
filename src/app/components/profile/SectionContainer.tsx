"use client";

import { ChevronDownIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

type SectionState = "complete" | "partial" | "empty";

type SectionContainerProps = {
  id: string;
  title: string;
  description?: string;
  state: SectionState;
  completedText?: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
};

function stateLabel(state: SectionState) {
  if (state === "complete") return "Completo";
  if (state === "partial") return "Parcial";
  return "Por preencher";
}

function stateBadgeClass(state: SectionState) {
  if (state === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "partial") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function SectionContainer({
  id,
  title,
  description,
  state,
  completedText,
  isOpen,
  onToggle,
  children,
}: SectionContainerProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stateBadgeClass(state)}`}>
              {stateLabel(state)}
            </span>
          </div>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          {completedText ? <p className="mt-1 text-xs text-slate-500">{completedText}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {state === "complete" ? (
            <CheckCircleIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
          ) : state === "partial" ? (
            <ExclamationCircleIcon className="h-5 w-5 text-amber-500" aria-hidden="true" />
          ) : null}
          <ChevronDownIcon
            className={`h-5 w-5 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {isOpen ? <div className="border-t border-slate-200 p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}
