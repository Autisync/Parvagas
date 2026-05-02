"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppToastTone = "success" | "error" | "warning" | "info";

type AppToast = {
  id: number;
  message: string;
  tone: AppToastTone;
  durationMs: number;
};

type AppNotifierContextValue = {
  notify: (message: string, tone?: AppToastTone, durationMs?: number) => void;
  dismiss: (id: number) => void;
};

const AppNotifierContext = createContext<AppNotifierContextValue | null>(null);

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: AppToast;
  onDismiss: (id: number) => void;
}) {
  const [remaining, setRemaining] = useState(toast.durationMs);

  useEffect(() => {
    setRemaining(toast.durationMs);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(toast.durationMs - elapsed, 0);
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, [toast, onDismiss]);

  const toneStyles: Record<AppToastTone, { box: string; bar: string }> = {
    error: {
      box: "border-rose-300 text-rose-800",
      bar: "bg-rose-500",
    },
    success: {
      box: "border-emerald-300 text-emerald-800",
      bar: "bg-emerald-500",
    },
    warning: {
      box: "border-amber-300 text-amber-800",
      bar: "bg-amber-500",
    },
    info: {
      box: "border-sky-300 text-sky-800",
      bar: "bg-sky-500",
    },
  };

  const ratio = toast.durationMs > 0 ? Math.max(remaining / toast.durationMs, 0) : 0;
  const style = toneStyles[toast.tone] || toneStyles.info;

  return (
    <div className={`pointer-events-auto overflow-hidden rounded-2xl border bg-[whitesmoke] shadow-xl ${style.box}`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold leading-5">{toast.message}</p>
        <button
          type="button"
          aria-label="Fechar notificação"
          onClick={() => onDismiss(toast.id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-current/25 opacity-80 transition hover:opacity-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="h-1.5 w-full bg-white/60">
        <div className={`h-full transition-[width] duration-75 ease-linear ${style.bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export function AppNotifierProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: AppToastTone = "info", durationMs = 4500) => {
    if (!message.trim()) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, message, tone, durationMs }]);
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <AppNotifierContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[95] w-[min(92vw,420px)] space-y-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </AppNotifierContext.Provider>
  );
}

export function useAppNotifier() {
  const ctx = useContext(AppNotifierContext);
  if (!ctx) {
    throw new Error("useAppNotifier must be used within AppNotifierProvider.");
  }
  return ctx;
}
