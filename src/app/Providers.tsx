"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppNotifierProvider } from "@/app/components/AppNotifier";
import { GlobalErrorProvider } from "@/app/components/errors/GlobalErrorProvider";
import LiveUpdateBridge from "@/app/components/LiveUpdateBridge";
import SessionManager from "@/app/components/SessionManager";

const RUNTIME_INTENSIVE_PREFIXES = [
  "/Portal",
  "/Admin",
  "/Dashboard",
  "/Submission",
  "/Aplicar",
];

const AUTH_PAGES = new Set(["/Login", "/Admin/Login"]);

function shouldEnableRuntimeFeatures(pathname: string) {
  if (AUTH_PAGES.has(pathname)) return false;
  return RUNTIME_INTENSIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enableRuntimeFeatures = shouldEnableRuntimeFeatures(pathname || "");

  return (
    <QueryClientProvider client={queryClient}>
      <AppNotifierProvider>
        {enableRuntimeFeatures ? <SessionManager /> : null}
        <GlobalErrorProvider>{children}</GlobalErrorProvider>
        {enableRuntimeFeatures ? <LiveUpdateBridge /> : null}
      </AppNotifierProvider>
    </QueryClientProvider>
  );
}
