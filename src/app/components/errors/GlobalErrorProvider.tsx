"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { useAppNotifier } from "@/app/components/AppNotifier";
import type { AppError } from "@/lib/errorModel";
import { normalizePtErrorMessage } from "@/lib/errorModel";

type ErrorContextValue = {
  reportError: (error: AppError) => void;
};

const ErrorContext = createContext<ErrorContextValue | null>(null);

function hashError(error: AppError) {
  return `${error.type}:${error.message.trim().toLowerCase()}:${error.action || "none"}`;
}

function actionLabel(action?: AppError["action"]) {
  if (action === "login") return "Iniciar sessao";
  if (action === "reload") return "Recarregar";
  return "Tentar novamente";
}

export function GlobalErrorProvider({ children }: { children: ReactNode }) {
  const { notify, showBanner, showModalError } = useAppNotifier();
  const lastErrorRef = useRef<{ hash: string; at: number } | null>(null);

  const reportError = useCallback((error: AppError) => {
    const normalizedMessage = normalizePtErrorMessage(error.message, error.type);
    const normalizedError: AppError = { ...error, message: normalizedMessage };
    const hash = hashError(normalizedError);
    const now = Date.now();

    if (lastErrorRef.current && lastErrorRef.current.hash === hash && now - lastErrorRef.current.at < 3000) {
      return;
    }
    lastErrorRef.current = { hash, at: now };

    if (normalizedError.type === "validation") {
      return;
    }

    if (normalizedError.type === "network") {
      showBanner(
        "Nao conseguimos contactar o servidor neste momento.",
        actionLabel(normalizedError.action || "retry"),
      );
      return;
    }

    if (normalizedError.type === "auth") {
      showBanner("A sua sessao expirou. Inicie sessao novamente.", "Iniciar sessao", () => {
        if (typeof window !== "undefined") {
          window.location.assign("/Login");
        }
      });
      return;
    }

    if (normalizedError.type === "permission") {
      showBanner("Nao tem permissao para esta acao.");
      return;
    }

    if (normalizedError.type === "critical") {
      showModalError("Falha critica", normalizedError.message);
      return;
    }

    if (normalizedError.type === "rate_limit") {
      notify(normalizedError.message, "warning");
      return;
    }

    if (normalizedError.action === "reload" || normalizedError.action === "retry") {
      showBanner(normalizedError.message, actionLabel(normalizedError.action));
      return;
    }

    notify(normalizedError.message, "error");
  }, [notify, showBanner, showModalError]);

  const value = useMemo(() => ({ reportError }), [reportError]);

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}

export function useError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) {
    throw new Error("useError must be used within GlobalErrorProvider.");
  }
  return ctx;
}
