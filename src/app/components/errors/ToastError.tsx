import { useEffect } from "react";
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

type ToastTone = "success" | "error" | "warning" | "info";

export type ToastErrorProps = {
  id: number;
  title: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  onDismiss: (id: number) => void;
  onRetry?: () => void;
};

function toneStyle(tone: ToastTone) {
  if (tone === "success") {
    return {
      root: "border-emerald-200 bg-emerald-50",
      title: "text-emerald-800",
      message: "text-emerald-700",
      icon: "text-emerald-500",
      button: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100",
    };
  }
  if (tone === "warning") {
    return {
      root: "border-amber-200 bg-amber-50",
      title: "text-amber-900",
      message: "text-amber-800",
      icon: "text-amber-500",
      button: "border-amber-200 bg-white text-amber-900 hover:bg-amber-100",
    };
  }
  if (tone === "info") {
    return {
      root: "border-slate-200 bg-slate-50",
      title: "text-slate-800",
      message: "text-slate-700",
      icon: "text-slate-500",
      button: "border-slate-200 bg-white text-slate-800 hover:bg-slate-100",
    };
  }
  return {
    root: "border-rose-200 bg-rose-50",
    title: "text-rose-800",
    message: "text-rose-700",
    icon: "text-rose-500",
    button: "border-rose-200 bg-white text-rose-800 hover:bg-rose-100",
  };
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CheckCircleIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500" aria-hidden="true" />;
  if (tone === "info") return <InformationCircleIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-500" aria-hidden="true" />;
  return <ExclamationTriangleIcon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />;
}

export default function ToastError({
  id,
  title,
  message,
  tone = "error",
  durationMs = 5000,
  onDismiss,
  onRetry,
}: ToastErrorProps) {
  const styles = toneStyle(tone);

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, id, onDismiss]);

  return (
    <div
      role="alert"
      className={`pointer-events-auto rounded-2xl border p-3.5 shadow-lg ${styles.root}`}
    >
      <div className="flex items-start gap-3">
        <div className={styles.icon}>
          <ToneIcon tone={tone} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
          <p className={`mt-0.5 text-sm ${styles.message}`}>{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`mt-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${styles.button}`}
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
          className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-100"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
