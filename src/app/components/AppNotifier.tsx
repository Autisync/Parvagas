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
import BannerError from "@/app/components/errors/BannerError";
import ModalError from "@/app/components/errors/ModalError";
import ToastError from "@/app/components/errors/ToastError";
import { ERROR_AUTO_DISMISS_MS } from "@/config/appConfig";
import { setGlobalErrorDispatch } from "@/lib/errorBridge";
import { logErrorToMonitoring } from "@/lib/errorMonitoring";

export type AppToastTone = "success" | "error" | "warning" | "info";

type AppToast = {
  id: number;
  message: string;
  title: string;
  tone: AppToastTone;
  durationMs: number;
  retry?: () => void;
};

type BannerState = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
} | null;

type ModalState = {
  title: string;
  message: string;
  supportCode?: string;
} | null;

type AppNotifierContextValue = {
  notify: (message: string, tone?: AppToastTone, durationMs?: number, retry?: () => void) => void;
  dismiss: (id: number) => void;
  showBanner: (message: string, actionLabel?: string, onAction?: () => void) => void;
  clearBanner: () => void;
  showModalError: (title: string, message: string, supportCode?: string) => void;
  clearModalError: () => void;
};

const AppNotifierContext = createContext<AppNotifierContextValue | null>(null);

export function AppNotifierProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [banner, setBanner] = useState<BannerState>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: AppToastTone = "info", durationMs = ERROR_AUTO_DISMISS_MS, retry?: () => void) => {
      if (!message.trim()) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const title =
        tone === "error"
          ? "Erro"
          : tone === "warning"
            ? "Atenção"
            : tone === "success"
              ? "Concluído"
              : "Informação";
      setToasts((prev) => [...prev.slice(-3), { id, message, title, tone, durationMs, retry }]);
      if (tone === "error") {
        void logErrorToMonitoring({
          level: "error",
          message,
          timestamp: new Date().toISOString(),
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
      }
    },
    [],
  );

  const showBanner = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    if (!message.trim()) return;
    setBanner({
      title: "Problema de ligação",
      message,
      actionLabel,
      onAction,
    });
    void logErrorToMonitoring({
      level: "warning",
      message,
      timestamp: new Date().toISOString(),
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, []);

  const clearBanner = useCallback(() => setBanner(null), []);

  const showModalError = useCallback((title: string, message: string, supportCode?: string) => {
    setModal({ title, message, supportCode });
    void logErrorToMonitoring({
      level: "critical",
      message: `${title}: ${message}`,
      details: supportCode,
      timestamp: new Date().toISOString(),
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, []);

  const clearModalError = useCallback(() => setModal(null), []);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : "Falha crítica inesperada.";
      showModalError(
        "Não foi possível concluir esta operação",
        `${message} Verifique a ligação à internet e tente novamente.`,
      );
    };

    const onError = (event: ErrorEvent) => {
      showModalError(
        "Ocorreu uma falha no sistema",
        event.message || "A aplicação encontrou um erro inesperado.",
      );
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, [showModalError]);

  useEffect(() => {
    setGlobalErrorDispatch({
      toast: (message, retry) => notify(message, "error", ERROR_AUTO_DISMISS_MS, retry),
      banner: (message, actionLabel, onAction) => showBanner(message, actionLabel, onAction),
      modal: (title, message, supportCode) => showModalError(title, message, supportCode),
    });

    return () => setGlobalErrorDispatch(null);
  }, [notify, showBanner, showModalError]);

  const value = useMemo(
    () => ({
      notify,
      dismiss,
      showBanner,
      clearBanner,
      showModalError,
      clearModalError,
    }),
    [notify, dismiss, showBanner, clearBanner, showModalError, clearModalError],
  );

  return (
    <AppNotifierContext.Provider value={value}>
      {banner && (
        <BannerError
          title={banner.title}
          message={banner.message}
          actionLabel={banner.actionLabel}
          onAction={banner.onAction}
          onDismiss={clearBanner}
        />
      )}
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[95] w-[min(92vw,420px)] space-y-2">
        {toasts.map((toast) => (
          <ToastError
            key={toast.id}
            id={toast.id}
            title={toast.title}
            message={toast.message}
            onDismiss={dismiss}
            onRetry={toast.retry}
          />
        ))}
      </div>
      <ModalError
        open={Boolean(modal)}
        title={modal?.title || "Erro"}
        message={modal?.message || "Falha inesperada."}
        supportCode={modal?.supportCode}
        onPrimary={() => {
          clearModalError();
          if (typeof window !== "undefined") window.history.back();
        }}
        onSecondary={() => {
          if (typeof window !== "undefined") window.open("mailto:suporte@parvagas.co.ao", "_blank");
        }}
      />
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
