"use client";

import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AppNotifierProvider } from "@/app/components/AppNotifier";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppNotifierProvider>{children}</AppNotifierProvider>
    </QueryClientProvider>
  );
}
