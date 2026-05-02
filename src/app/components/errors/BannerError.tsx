import { ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/solid";

type BannerErrorProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

export default function BannerError({
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: BannerErrorProps) {
  return (
    <div
      role="alert"
      className="w-full border-b border-red-300 bg-red-50 text-red-900"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-sm">{message}</p>
        </div>
        {onAction && actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 rounded-lg border border-red-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {actionLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar alerta"
            className="rounded-md p-1 text-red-700 hover:bg-red-100"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
