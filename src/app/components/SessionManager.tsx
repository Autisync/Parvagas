"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearToken,
  getLastSessionActivityAt,
  getSessionIdleTimeoutMs,
  getToken,
  logoutCurrentSession,
  touchClientSession,
} from "@/lib/api";

const AUTH_ROUTES = new Set(["/Login", "/Admin/Login"]);
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "scroll", "touchstart"];

function getLoginRoute(pathname: string, token: string | null) {
  if (pathname.startsWith("/Portal/Admin") || pathname.startsWith("/Admin")) return "/Admin/Login";
  return token ? "/Login" : "/Login";
}

export default function SessionManager() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (AUTH_ROUTES.has(pathname)) return;

    let timeoutId: number | undefined;
    const token = getToken();
    if (!token) return;

    const scheduleIdleCheck = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      const idleTimeoutMs = getSessionIdleTimeoutMs();
      const lastActivityAt = getLastSessionActivityAt() || Date.now();
      const remainingMs = Math.max(idleTimeoutMs - (Date.now() - lastActivityAt), 0);

      timeoutId = window.setTimeout(() => {
        logoutCurrentSession(getToken()).finally(() => {
          router.replace(getLoginRoute(pathname, token));
        });
      }, remainingMs);
    };

    const markActivity = () => {
      if (!getToken()) return;
      touchClientSession();
      scheduleIdleCheck();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "parvagas_logout_at") {
        clearToken();
        router.replace(getLoginRoute(pathname, token));
        return;
      }

      if (event.key === "parvagas_last_activity_at") {
        scheduleIdleCheck();
      }
    };

    const handleSessionEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ event?: string }>;
      if (customEvent.detail?.event === "logout") {
        router.replace(getLoginRoute(pathname, token));
        return;
      }
      scheduleIdleCheck();
    };

    if (!getLastSessionActivityAt()) {
      touchClientSession();
    }

    scheduleIdleCheck();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    window.addEventListener("storage", handleStorage);
    window.addEventListener("parvagas:session", handleSessionEvent as EventListener);
    document.addEventListener("visibilitychange", markActivity);

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("parvagas:session", handleSessionEvent as EventListener);
      document.removeEventListener("visibilitychange", markActivity);
    };
  }, [pathname, router]);

  return null;
}