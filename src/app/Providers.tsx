"use client";

import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppNotifierProvider } from "@/app/components/AppNotifier";
import { GlobalErrorProvider } from "@/app/components/errors/GlobalErrorProvider";
import LiveUpdateBridge from "@/app/components/LiveUpdateBridge";
import SessionManager from "@/app/components/SessionManager";
import { warnMissingSupabaseEnv } from "@/lib/supabaseBrowserClient";

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    warnMissingSupabaseEnv();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppNotifierProvider>
        <SessionManager />
        <GlobalErrorProvider>{children}</GlobalErrorProvider>
        <LiveUpdateBridge />
      </AppNotifierProvider>
    </QueryClientProvider>
  );
}
