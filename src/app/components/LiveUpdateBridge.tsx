"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { queryClient } from "@/lib/queryClient";
import { ApiError, apiUrl } from "@/lib/api";

const ROUTE_REFRESH_DEBOUNCE_MS = 900;

type LiveUpdatePayload = {
  scope?: string;
  entity?: string;
  action?: string;
  path?: string;
  ts?: string;
};

function scopesForPath(pathname: string): Set<string> {
  if (pathname.startsWith("/Portal/Admin/analytics")) {
    return new Set(["admin", "jobs", "companies", "applications", "users", "candidates"]);
  }
  if (pathname.startsWith("/Portal/Admin/jobs")) return new Set(["admin", "jobs"]);
  if (pathname.startsWith("/Portal/Admin/companies")) return new Set(["admin", "companies", "users"]);
  if (pathname.startsWith("/Portal/Admin/users")) return new Set(["admin", "users"]);
  if (pathname.startsWith("/Portal/Admin/ads")) return new Set(["admin"]);
  if (pathname.startsWith("/Portal/Admin/scraped")) return new Set(["admin", "jobs"]);
  if (pathname.startsWith("/Portal/Admin")) return new Set(["admin", "jobs", "companies", "applications", "users", "candidates"]);
  if (pathname.startsWith("/Portal/Empresa")) return new Set(["companies", "jobs", "applications", "users"]);
  if (pathname.startsWith("/Portal/Candidato")) return new Set(["candidates", "jobs", "applications", "users", "companies"]);
  if (pathname.startsWith("/Submission") || pathname.startsWith("/Aplicar")) return new Set(["applications", "jobs"]);
  return new Set(["public", "jobs", "companies"]);
}

function shouldRefreshForPayload(pathname: string, payload: LiveUpdatePayload) {
  const scope = String(payload?.scope || "global");
  if (scope === "global") return true;
  return scopesForPath(pathname).has(scope);
}

export default function LiveUpdateBridge() {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    let streamUrl = "";
    try {
      streamUrl = apiUrl("/events/stream");
    } catch (error) {
      if (error instanceof ApiError) {
        console.warn("[live-update] stream desativado: NEXT_PUBLIC_API_URL não configurada.");
      }
      return () => undefined;
    }

    const stream = new EventSource(streamUrl);

    const triggerRefresh = (payload: LiveUpdatePayload) => {
      if (!isMounted) return;
      const pathname = window.location.pathname;
      if (!shouldRefreshForPayload(pathname, payload)) return;

      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = window.setTimeout(() => {
        if (!isMounted) return;
        refreshTimer.current = null;
        queryClient.invalidateQueries().catch(() => undefined);
        window.dispatchEvent(new CustomEvent("parvagas:live-update", { detail: payload }));
        router.refresh();
      }, ROUTE_REFRESH_DEBOUNCE_MS);
    };

    const onInvalidate = (event: Event) => {
      const payload = (event as MessageEvent<LiveUpdatePayload>)?.data || {};
      triggerRefresh(payload);
    };

    stream.addEventListener("invalidate", onInvalidate);

    stream.onerror = () => {
      // Let EventSource auto-reconnect silently.
    };

    return () => {
      isMounted = false;
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
      }
      stream.close();
    };
  }, [router]);

  return null;
}
