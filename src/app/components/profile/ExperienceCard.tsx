"use client";

import { PencilSquareIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";

export type ExperienceItem = {
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
};

type ExperienceCardProps = {
  item: ExperienceItem;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

function formatMonth(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
}

export default function ExperienceCard({ item, onEdit, onDelete, onMoveUp, onMoveDown }: ExperienceCardProps) {
  const period = `${formatMonth(item.startDate)} - ${item.current ? "Atual" : formatMonth(item.endDate)}`;

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-slate-900">{item.jobTitle}</h5>
          <p className="mt-1 text-sm text-slate-700">{item.company} · {item.location || "Local não indicado"}</p>
          <p className="mt-1 text-xs text-slate-500">{period}</p>
        </div>

        <div className="flex items-center gap-1">
          {onMoveUp ? (
            <button type="button" onClick={onMoveUp} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Mover para cima">
              <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" onClick={onMoveDown} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Mover para baixo">
              <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Editar experiência">
            <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100" aria-label="Remover experiência">
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {item.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p> : null}
    </article>
  );
}
