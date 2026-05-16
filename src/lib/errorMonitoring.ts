type ErrorLogPayload = {
  level: "warning" | "error" | "critical";
  message: string;
  details?: unknown;
  path?: string;
  timestamp: string;
};

function isIgnorableClientNoise(message: string) {
  const m = String(message || "").toLowerCase();
  const hydrationRegex = /hydration failed|didn['’]t match the client|did not match the client/i;
  const extensionRegex = /securevoult|data-sv-|cz-shortcut-listen/i;
  const resizeObserverRegex = /resizeobserver loop completed|resizeobserver loop limit exceeded/i;
  return (
    hydrationRegex.test(m) ||
    m.includes("router action dispatched before initialization") ||
    resizeObserverRegex.test(m) ||
    extensionRegex.test(m)
  );
}

export async function logErrorToMonitoring(payload: ErrorLogPayload) {
  if (isIgnorableClientNoise(payload.message)) return;

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
