"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearToken,
  getLastSessionActivityAt,
  getSessionIdleTimeoutMs,
  getToken,
  getTokenExpiryMs,
  isTokenExpired,
  logoutCurrentSession,
  touchClientSession,
} from "@/lib/api";

const AUTH_ROUTES = new Set(["/Login", "/Admin/Login"]);
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "scroll", "touchstart"];
// Only persist an activity heartbeat at most this often, so high-frequency
// events (mousemove/scroll) don't write to localStorage on every tick.
const ACTIVITY_THROTTLE_MS = 15 * 1000;

function getLoginRoute(pathname: string) {
  if (pathname.startsWith("/Portal/Admin") || pathname.startsWith("/Admin")) return "/Admin/Login";
  return "/Login";
}

function loginWithReason(pathname: string, reason: "expired" | "idle") {
  const base = getLoginRoute(pathname);
  return `${base}?session=${reason}`;
}

export default function SessionManager() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (AUTH_ROUTES.has(pathname)) return;

    const token = getToken();
    if (!token) return;

    let idleTimeoutId: number | undefined;
    let expiryTimeoutId: number | undefined;
    let lastActivityWrite = 0;
    let loggedOut = false;

    const clearTimers = () => {
      if (idleTimeoutId !== undefined) window.clearTimeout(idleTimeoutId);
      if (expiryTimeoutId !== undefined) window.clearTimeout(expiryTimeoutId);
    };

    // Single exit path — runs once, clears the session locally, signals other
    // tabs, and routes to the right login screen with a reason for the banner.
    const forceLogout = (reason: "expired" | "idle") => {
      if (loggedOut) return;
      loggedOut = true;
      clearTimers();
      logoutCurrentSession(getToken()).finally(() => {
        router.replace(loginWithReason(pathname, reason));
      });
    };

    // Hard ceiling: log out exactly when the JWT expires, regardless of activity.
    const scheduleExpiryCheck = () => {
      if (expiryTimeoutId !== undefined) window.clearTimeout(expiryTimeoutId);
      const expMs = getTokenExpiryMs(getToken());
      if (!expMs) return; // No exp claim — fall back to idle timeout only.
      const remainingMs = Math.max(expMs - Date.now(), 0);
      expiryTimeoutId = window.setTimeout(() => forceLogout("expired"), remainingMs);
    };

    // Sliding window: log out after a stretch of inactivity.
    const scheduleIdleCheck = () => {
      if (idleTimeoutId !== undefined) window.clearTimeout(idleTimeoutId);
      const idleTimeoutMs = getSessionIdleTimeoutMs();
      const lastActivityAt = getLastSessionActivityAt() || Date.now();
      const remainingMs = Math.max(idleTimeoutMs - (Date.now() - lastActivityAt), 0);
      idleTimeoutId = window.setTimeout(() => forceLogout("idle"), remainingMs);
    };

    const markActivity = () => {
      if (loggedOut || !getToken()) return;
      // An expired token can't be "refreshed" by activity — log out instead.
      if (isTokenExpired(getToken())) {
        forceLogout("expired");
        return;
      }
      const now = Date.now();
      if (now - lastActivityWrite >= ACTIVITY_THROTTLE_MS) {
        lastActivityWrite = now;
        touchClientSession();
      }
      scheduleIdleCheck();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "parvagas_logout_at") {
        clearToken();
        if (!loggedOut) {
          loggedOut = true;
          clearTimers();
          router.replace(getLoginRoute(pathname));
        }
        return;
      }
      if (event.key === "parvagas_last_activity_at") {
        scheduleIdleCheck();
      }
    };

    const handleSessionEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ event?: string }>;
      if (customEvent.detail?.event === "logout") {
        if (!loggedOut) {
          loggedOut = true;
          clearTimers();
          router.replace(getLoginRoute(pathname));
        }
        return;
      }
      scheduleIdleCheck();
    };

    // If the token is already dead when this mounts (e.g. tab left open past
    // expiry), don't wait — log out immediately so no failing data call fires.
    if (isTokenExpired(token)) {
      forceLogout("expired");
      return;
    }

    if (!getLastSessionActivityAt()) {
      touchClientSession();
      lastActivityWrite = Date.now();
    }

    scheduleIdleCheck();
    scheduleExpiryCheck();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    window.addEventListener("storage", handleStorage);
    window.addEventListener("parvagas:session", handleSessionEvent as EventListener);
    document.addEventListener("visibilitychange", markActivity);

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("parvagas:session", handleSessionEvent as EventListener);
      document.removeEventListener("visibilitychange", markActivity);
    };
  }, [pathname, router]);

  return null;
}
