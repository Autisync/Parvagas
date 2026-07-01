import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

export type FeedbackVariant = "error" | "success" | "warning" | "info";

export type FeedbackAlertProps = {
  variant: FeedbackVariant;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
};

const variantStyles: Record<FeedbackVariant, { container: string; title: string; message: string; button: string; icon: string }> = {
  error: {
    container: "border-rose-200 bg-rose-50",
    title: "text-rose-800",
    message: "text-rose-700",
    button: "border-rose-200 bg-white text-rose-800 hover:bg-rose-100",
    icon: "text-rose-500",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-800",
    message: "text-emerald-700",
    button: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100",
    icon: "text-emerald-500",
  },
  // Left accent bar (unlike the other variants) keeps this readable as an
  // urgent notice rather than a muted tip — amber-50/200 alone read as too
  // soft next to the app's saturated brand-red surfaces.
  warning: {
    container: "border-amber-200 border-l-4 border-l-amber-500 bg-amber-50",
    title: "text-amber-900",
    message: "text-amber-800",
    button: "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
    icon: "text-amber-600",
  },
  info: {
    container: "border-slate-200 bg-slate-50",
    title: "text-slate-800",
    message: "text-slate-700",
    button: "border-slate-200 bg-white text-slate-800 hover:bg-slate-100",
    icon: "text-slate-500",
  },
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
  const styles = variantStyles[variant];
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
