type ErrorLogPayload = {
  level: "warning" | "error" | "critical";
  message: string;
  details?: unknown;
  path?: string;
  timestamp: string;
};

export async function logErrorToMonitoring(payload: ErrorLogPayload) {
  const endpoint = process.env.NEXT_PUBLIC_ERROR_LOG_ENDPOINT;
  try {
    if (endpoint) {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      return;
    }
  } catch {
    // Fallback to console if monitoring endpoint is unreachable.
  }

  if (payload.level === "critical") {
    console.error("[monitoring-critical]", payload);
    return;
  }
  if (payload.level === "error") {
    console.error("[monitoring-error]", payload);
    return;
  }
  console.warn("[monitoring-warning]", payload);
}
