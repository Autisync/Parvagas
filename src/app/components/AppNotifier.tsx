"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import BannerError from "@/app/components/errors/BannerError";
import ModalError from "@/app/components/errors/ModalError";
import ToastError from "@/app/components/errors/ToastError";
import { ERROR_AUTO_DISMISS_MS, ERROR_DEDUPE_WINDOW_MS } from "@/config/appConfig";
import { setGlobalErrorDispatch } from "@/lib/errorBridge";
import type { AppError } from "@/lib/errorModel";
import { normalizeErrorMessage } from "@/lib/errorMessage";
import { logErrorToMonitoring } from "@/lib/errorMonitoring";

function isConnectionIssueMessage(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("nao foi possivel ligar ao servidor") ||
    m.includes("não foi possível ligar ao servidor") ||
    m.includes("nao conseguimos contactar o servidor") ||
    m.includes("não conseguimos contactar o servidor") ||
    m.includes("ligacao") ||
    m.includes("ligação") ||
    m.includes("ligar ao servidor") ||
    m.includes("internet") ||
    m.includes("network") ||
    m.includes("connection")
  );
}

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
  const recentErrorsRef = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: AppToastTone = "info", durationMs = ERROR_AUTO_DISMISS_MS, retry?: () => void) => {
      const normalized = normalizeErrorMessage(message);
      if (!normalized) return;

      const dedupeKey = `${tone}:${normalized.toLowerCase()}`;
      const now = Date.now();
      const lastShownAt = recentErrorsRef.current[dedupeKey] || 0;
      if (now - lastShownAt < ERROR_DEDUPE_WINDOW_MS) return;

      if (tone === "error" && isConnectionIssueMessage(normalized)) {
        recentErrorsRef.current[dedupeKey] = now;
        if (banner?.message !== normalized) {
          setBanner({
            title: "Ligação indisponível",
            message: normalized,
            actionLabel: "Tentar novamente",
          });
        }
        return;
      }

      if (tone === "error" && banner && isConnectionIssueMessage(normalized)) {
        return;
      }

      const id = Date.now() + Math.floor(Math.random() * 1000);
      const title =
        tone === "error"
          ? "Erro"
          : tone === "warning"
            ? "Atenção"
            : tone === "success"
              ? "Concluído"
              : "Informação";
      recentErrorsRef.current[dedupeKey] = now;
      setToasts((prev) => [...prev.slice(-3), { id, message: normalized, title, tone, durationMs, retry }]);
      if (tone === "error") {
        void logErrorToMonitoring({
          level: "error",
          message: normalized,
          timestamp: new Date().toISOString(),
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
      }
    },
    [banner],
  );

  const showBanner = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    const normalized = normalizeErrorMessage(message) || "Não conseguimos contactar o servidor neste momento.";
    if (banner?.message === normalized) return;

    setBanner({
      title: "Ligação indisponível",
      message: normalized,
      actionLabel: actionLabel || "Tentar novamente",
      onAction,
    });
    void logErrorToMonitoring({
      level: "warning",
      message: normalized,
      timestamp: new Date().toISOString(),
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [banner]);

  const clearBanner = useCallback(() => setBanner(null), []);

  const showModalError = useCallback((title: string, message: string, supportCode?: string) => {
    const normalized = normalizeErrorMessage(message) || "Falha inesperada.";
    if (modal?.title === title && modal?.message === normalized) return;

    setModal({ title, message: normalized, supportCode });
    void logErrorToMonitoring({
      level: "critical",
      message: `${title}: ${normalized}`,
      details: supportCode,
      timestamp: new Date().toISOString(),
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [modal]);

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
    const handleAppError = (error: AppError) => {
      const message = normalizeErrorMessage(error.message);

      if (error.type === "validation") return;

      if (error.type === "network") {
        showBanner("Não conseguimos contactar o servidor neste momento.", "Tentar novamente");
        return;
      }

      if (error.type === "auth") {
        showBanner("A sua sessão expirou. Faça login novamente.", "Iniciar sessão", () => {
          if (typeof window !== "undefined") window.location.assign("/Login");
        });
        return;
      }

      if (error.type === "permission") {
        showBanner("Não tem permissão para esta ação.");
        return;
      }

      if (error.type === "critical") {
        showModalError("Falha crítica", message || "Falha inesperada.");
        return;
      }

      if (error.type === "rate_limit") {
        notify(message || "Demasiadas tentativas. Tente novamente em instantes.", "warning");
        return;
      }

      if (error.action === "reload" || error.action === "retry") {
        showBanner(message || "Não foi possível concluir o pedido.", error.action === "reload" ? "Recarregar" : "Tentar novamente");
        return;
      }

      notify(message || "Não foi possível concluir o pedido.", "error", ERROR_AUTO_DISMISS_MS);
    };

    setGlobalErrorDispatch({
      toast: (message, retry) => {
        const normalized = normalizeErrorMessage(message);
        if (isConnectionIssueMessage(normalized)) {
          showBanner("Não conseguimos contactar o servidor neste momento.", "Tentar novamente", retry);
          return;
        }
        notify(normalized, "error", ERROR_AUTO_DISMISS_MS, retry);
      },
      banner: (message, actionLabel, onAction) => showBanner(message, actionLabel, onAction),
      modal: (title, message, supportCode) => showModalError(title, message, supportCode),
      appError: handleAppError,
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
            tone={toast.tone}
            durationMs={toast.durationMs}
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
