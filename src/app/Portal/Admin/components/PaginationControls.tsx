"use client";

import type { Pagination } from "../adminClient";

export default function PaginationControls({
  pagination,
  onPage,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [8, 15, 25, 50],
}: {
  pagination?: Pagination;
  onPage: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  if (!pagination) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-sm text-slate-600">
        Página {pagination.page} de {pagination.totalPages} · {pagination.total} registos
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            Itens por página
            <select
              value={pageSize ?? pagination.limit}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-700"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          disabled={pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Seguinte
        </button>
      </div>
    </div>
  );
}
