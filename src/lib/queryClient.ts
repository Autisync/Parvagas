import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 429 (rate limit) or 401 (unauthorized)
        if (error instanceof Error) {
          const message = error.message;
          if (message.includes("429") || message.includes("401") || message.includes("403")) {
            return false;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Was false — meant a portal tab left open in the background (the
      // common case for "I'm waiting on an application update") never
      // picked up new data until something else forced a remount. Data
      // that changed while the tab was away (a new applicant, a status
      // change, a message) now surfaces as soon as the user tabs back in,
      // with no manual refresh needed.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});
