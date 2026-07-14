import type { ParseResponse } from "./types";

export const toCsv = (value?: string[]) => (Array.isArray(value) ? value.join(", ") : "");
export const fromCsv = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);

export const normalizeMoney = (value: string) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getApiErrorMessage = (payload: ParseResponse, fallback: string) => {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (payload?.error && typeof payload.error === "object" && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return fallback;
};

export const reorderItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
