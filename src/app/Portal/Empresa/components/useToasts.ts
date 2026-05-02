"use client";

import { useCallback } from "react";
import { useAppNotifier } from "@/app/components/AppNotifier";

export type ToastType = "success" | "error" | "info";
export type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

export function useToasts() {
  const { notify } = useAppNotifier();

  const pushToast = useCallback((type: ToastType, message: string, ttl = 3200) => {
    const tone = type === "error" ? "error" : type === "success" ? "success" : "info";
    notify(message, tone, ttl);
  }, [notify]);

  const removeToast = useCallback((_id: number) => {
    // Global notifier handles dismissal directly.
  }, []);

  return { toasts: [] as ToastItem[], pushToast, removeToast };
}
