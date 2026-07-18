import { ApiError } from "@/lib/api";

/** Shared error-message mapping for the admin Analytics page's
 * independently-fetching panels (business funnels, email deliverability,
 * client errors, demand signals, auto-apply/AI usage). Each panel calls
 * authFetch with suppressGlobalErrors:true, so this inline message is the
 * only place the failure ever surfaces — silently rendering nothing (the
 * previous behavior) is indistinguishable from "no data yet". */
export function describeAnalyticsPanelError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return "Este painel requer uma versão mais recente do backend.";
    if (err.isNetworkError) return "Sem ligação ao servidor.";
  }
  return "Não foi possível carregar esta informação.";
}
