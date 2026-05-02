"use client";

import { Dialog } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

type ModalErrorProps = {
  open: boolean;
  title: string;
  message: string;
  supportCode?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export default function ModalError({
  open,
  title,
  message,
  supportCode,
  primaryLabel = "Voltar para a página anterior",
  secondaryLabel = "Contactar o suporte",
  onPrimary,
  onSecondary,
}: ModalErrorProps) {
  return (
    <Dialog open={open} onClose={() => undefined} className="relative z-[120]">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg rounded-2xl border border-red-300 bg-white p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-700">{message}</Dialog.Description>
              {supportCode && (
                <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                  Código de suporte: {supportCode}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={onPrimary}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
            >
              {primaryLabel}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
