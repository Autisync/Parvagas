"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

type AddItemModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function AddItemModal({ open, title, description, onClose, children }: AddItemModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-slate-900/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="w-full rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div>
            <h4 className="text-base font-semibold text-slate-900">{title}</h4>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
