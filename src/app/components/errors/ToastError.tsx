import { ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/solid";

export type ToastErrorProps = {
  id: number;
  title: string;
  message: string;
  onDismiss: (id: number) => void;
  onRetry?: () => void;
};

export default function ToastError({
  id,
  title,
  message,
  onDismiss,
  onRetry,
}: ToastErrorProps) {
  return (
    <div
      role="alert"
      className="pointer-events-auto rounded-2xl border border-red-300 bg-white p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-900">{title}</p>
          <p className="mt-1 text-sm text-slate-700">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Tentar novamente
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Fechar notificação"
          onClick={() => onDismiss(id)}
          className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-100"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
