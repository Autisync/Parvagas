import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toneStyles, type FeedbackTone } from "@/app/components/errors/toneStyles";

export type FeedbackVariant = FeedbackTone;

export type FeedbackAlertProps = {
  variant: FeedbackVariant;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
};

function variantIcon(variant: FeedbackVariant) {
  if (variant === "success") return CheckCircleIcon;
  if (variant === "info") return InformationCircleIcon;
  return ExclamationTriangleIcon;
}

export default function FeedbackAlert({
  variant,
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
  className = "",
}: FeedbackAlertProps) {
  const styles = toneStyles[variant];
  const Icon = variantIcon(variant);
  const role = variant === "success" || variant === "info" ? "status" : "alert";

  return (
    <div
      role={role}
      className={`w-full max-w-full overflow-hidden rounded-xl border px-3 py-2.5 ${styles.container} ${className}`.trim()}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {title ? <p className={`text-sm font-semibold leading-5 ${styles.title}`}>{title}</p> : null}
          <p className={`text-sm leading-5 break-words ${styles.message}`}>{message}</p>
          {onAction && actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              className={`mt-2 inline-flex max-w-full items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${styles.button}`}
            >
              <span className="truncate">{actionLabel}</span>
            </button>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar aviso"
            className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-slate-100"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
