import { getGlobalErrorDispatch } from "@/lib/errorBridge";
import { normalizeErrorMessage } from "@/lib/errorMessage";

const DEV_API_FALLBACK = "http://localhost:8000";
const API_V1_PREFIX = "/api/v1";
const DEV_API_FALLBACK_PORTS = [8000, 3001, 6001] as const;

const DEFAULT_TIMEOUT_MS = 20000;
const SESSION_TOKEN_KEY = "parvagas_token";
const SESSION_USER_KEY = "parvagas_user";
const SESSION_ACTIVITY_KEY = "parvagas_last_activity_at";
const SESSION_LOGOUT_KEY = "parvagas_logout_at";
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
let lastAuthExpiryHandledAt = 0;

function notifySessionChange(event: "logout" | "activity") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("parvagas:session", { detail: { event, at: Date.now() } }));
}

function clearSessionData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_ACTIVITY_KEY);
}

function recordLogoutSignal() {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_LOGOUT_KEY, String(Date.now()));
}

export function getSessionIdleTimeoutMs(): number {
  const configured = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS || DEFAULT_SESSION_IDLE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_SESSION_IDLE_TIMEOUT_MS;
}

export function getLastSessionActivityAt(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(SESSION_ACTIVITY_KEY) || 0);
}

export function touchClientSession() {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
  notifySessionChange("activity");
}

// Treat a token as expired slightly early so an in-flight request never races
// the server's own expiry check (which would surface as a confusing 401).
const TOKEN_EXPIRY_GRACE_MS = 10 * 1000;

/** Decode a JWT payload (base64url) without verifying the signature. */
export function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token || typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = typeof atob !== "undefined" ? atob(padded) : "";
    if (!binary) return null;
    // Recover UTF-8 (names/emails can be non-ASCII) before JSON.parse.
    const json = decodeURIComponent(
      binary
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Token expiry as epoch milliseconds, or 0 when there is no `exp` claim. */
export function getTokenExpiryMs(token: string | null): number {
  const payload = decodeJwtPayload(token);
  const exp = payload && typeof payload.exp === "number" ? payload.exp : 0;
  return exp > 0 ? exp * 1000 : 0;
}

/** True when the token carries an `exp` claim that has passed (minus grace). */
export function isTokenExpired(token: string | null): boolean {
  const expMs = getTokenExpiryMs(token);
  if (!expMs) return false; // No exp claim — cannot prove expiry, don't force logout.
  return Date.now() >= expMs - TOKEN_EXPIRY_GRACE_MS;
}

/** True when the stored session is still usable (token present, not expired, not idle-timed-out). */
export function isSessionValid(): boolean {
  const token = getToken();
  if (!token || isTokenExpired(token)) return false;
  const lastActivity = getLastSessionActivityAt();
  if (lastActivity && Date.now() - lastActivity > getSessionIdleTimeoutMs()) return false;
  return true;
}

export type ApiFetchOptions = RequestInit & {
  suppressGlobalErrors?: boolean;
};

export class ApiError extends Error {
  status?: number;
  retryAfter?: number;
  details?: unknown;
  requestId?: string;
  isNetworkError?: boolean;

  constructor(message: string, options: {
    status?: number;
    retryAfter?: number;
    details?: unknown;
    requestId?: string;
    isNetworkError?: boolean;
  } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
    this.requestId = options.requestId;
    this.isNetworkError = options.isNetworkError;
  }
}

export function getErrorMessage(error: unknown, fallback = "Ocorreu um erro inesperado.") {
  if (error instanceof ApiError) {
    return normalizeErrorMessage(error.message) || fallback;
  }
  if (error instanceof Error) {
    return normalizeErrorMessage(error.message) || fallback;
  }
  if (typeof error === "string" && error.trim()) {
    return normalizeErrorMessage(error);
  }
  return fallback;
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const [base] = getApiBaseCandidates();
  if (!base) {
    throw new ApiError("Não foi possível ligar-se ao serviço neste momento. Tente novamente mais tarde.");
  }

  return buildApiUrl(base, path);
}

export function buildApiUrl(base: string, path: string): string {
  const normalizedBase = String(base || "").trim().replace(/\/$/, "");
  if (!normalizedBase) {
    throw new ApiError("Não foi possível ligar-se ao serviço neste momento. Tente novamente mais tarde.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseAlreadyHasApiPrefix = /\/api\/v1$/i.test(normalizedBase);
  const routePath =
    baseAlreadyHasApiPrefix || normalizedPath.startsWith("/api/")
      ? normalizedPath
      : `${API_V1_PREFIX}${normalizedPath}`;

  return `${normalizedBase}${routePath}`;
}

function withLocalHostFallbacks(base: string): string[] {
  const normalizedBase = String(base || "").trim().replace(/\/$/, "");
  if (!normalizedBase) return [];

  try {
    const parsed = new URL(normalizedBase);
    if (parsed.hostname === "localhost") {
      const alt = new URL(parsed.toString());
      alt.hostname = "127.0.0.1";
      return [normalizedBase, alt.toString().replace(/\/$/, "")];
    }
    if (parsed.hostname === "127.0.0.1") {
      const alt = new URL(parsed.toString());
      alt.hostname = "localhost";
      return [normalizedBase, alt.toString().replace(/\/$/, "")];
    }
  } catch {
    // Ignore invalid URL input and keep original value only.
  }

  return [normalizedBase];
}

function getWindowLocalCandidates(): string[] {
  if (typeof window === "undefined") return [];
  const host = window.location.hostname || "localhost";
  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const rawCandidates = DEV_API_FALLBACK_PORTS.flatMap((port) =>
    withLocalHostFallbacks(`${protocol}://${host}:${port}`)
  );
  return Array.from(new Set(rawCandidates));
}

function getApiBaseCandidates(): string[] {
  const configured = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (configured) {
    const configuredCandidates = withLocalHostFallbacks(configured);
    // If NEXT_PUBLIC_API_URL is configured, keep requests deterministic and avoid
    // probing extra dev ports that can introduce long timeouts during login.
    return configuredCandidates;
  }

  if (typeof window !== "undefined") {
    return getWindowLocalCandidates();
  }

  return process.env.NODE_ENV === "production" ? [] : [DEV_API_FALLBACK];
}

export function getApiBaseUrl(): string {
  const [base] = getApiBaseCandidates();
  return base || "";
}

async function parseResponseBody(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json().catch(() => ({}));
  }
  const text = await res.text().catch(() => "");
  return text ? { error: text } : {};
}

function fallbackStatusMessage(status: number) {
  if (status === 400) return "Pedido inválido.";
  if (status === 401) return "Sessão expirada. Faça login novamente.";
  if (status === 403) return "Sem permissão para esta ação.";
  if (status === 404) return "Recurso não encontrado.";
  if (status === 409) return "Conflito ao processar o pedido.";
  if (status === 422) return "Dados inválidos para esta operação.";
  if (status === 429) return "Demasiadas tentativas. Tente novamente em instantes.";
  if (status >= 500) return "Erro interno do servidor. Tente novamente.";
  return "Não foi possível concluir o pedido neste momento.";
}

function extractBearerToken(headers: HeadersInit | undefined): string {
  if (!headers) return "";

  const readFromValue = (value: unknown) => {
    if (typeof value !== "string") return "";
    const match = /^Bearer\s+(.+)$/i.exec(value.trim());
    return match?.[1]?.trim() || "";
  };

  if (headers instanceof Headers) {
    return readFromValue(headers.get("Authorization"));
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => String(key).toLowerCase() === "authorization");
    return found ? readFromValue(found[1]) : "";
  }

  const recordHeaders = headers as Record<string, string>;
  const value = recordHeaders.Authorization ?? recordHeaders.authorization;
  return readFromValue(value);
}

function isAuthPath(path: string) {
  const normalizedPath = String(path || "").toLowerCase();
  return normalizedPath.includes("/auth/login") || normalizedPath.includes("/auth/first-login-reset");
}

function shouldHandleAuthExpiry(path: string, requestToken: string) {
  if (isAuthPath(path)) return false;
  if (!requestToken) return false;

  const currentToken = getToken();
  return Boolean(currentToken && currentToken === requestToken);
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: ApiFetchOptions
): Promise<T> {
  const isFormDataBody = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const headers = new Headers(options?.headers || undefined);
  if (!isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await apiFetchRaw(path, {
    ...options,
    headers,
  });
  const requestToken = extractBearerToken(headers);

  if (!res.ok) {
    const body = await parseResponseBody(res);
    const requestId = res.headers.get("x-request-id") || undefined;
    const responseBody = body as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    const nestedErrorMessage =
      responseBody.error &&
      typeof responseBody.error === "object" &&
      typeof (responseBody.error as { message?: unknown }).message === "string"
        ? String((responseBody.error as { message?: string }).message)
        : "";
    const messageFromBody =
      (typeof responseBody.error === "string" ? String(responseBody.error) : "") ||
      nestedErrorMessage ||
      (typeof responseBody.detail === "string" ? String(responseBody.detail) : "") ||
      (typeof responseBody.message === "string" ? String(responseBody.message) : "");
    const message = normalizeErrorMessage(messageFromBody) || fallbackStatusMessage(res.status);

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new ApiError(
        `${message}${retryAfter ? ` (Tente novamente em ${retryAfter}s)` : ""}`,
        {
          status: 429,
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : 60,
          details: body,
          requestId,
        }
      );
    }

    if (!options?.suppressGlobalErrors) {
      if (res.status >= 500) {
        getGlobalErrorDispatch()?.appError?.({
          type: "critical",
          message: "Estamos com instabilidade no servidor. Aguarde alguns instantes e tente novamente.",
          action: "retry",
        });
      } else if (res.status === 401) {
        const now = Date.now();
        if (shouldHandleAuthExpiry(path, requestToken) && now - lastAuthExpiryHandledAt > 1500) {
          lastAuthExpiryHandledAt = now;
          clearSessionData();
          recordLogoutSignal();
          notifySessionChange("logout");
          getGlobalErrorDispatch()?.appError?.({
            type: "auth",
            message: "A sua sessão expirou. Faça login novamente.",
            action: "login",
          });
        }
      } else if (res.status === 403) {
        getGlobalErrorDispatch()?.appError?.({
          type: "permission",
          message,
        });
      } else if (res.status === 429) {
        getGlobalErrorDispatch()?.appError?.({
          type: "rate_limit",
          message,
          action: "retry",
        });
      } else {
        getGlobalErrorDispatch()?.appError?.({
          type: "server",
          message,
          action: "retry",
        });
      }
    }

    throw new ApiError(message, {
      status: res.status,
      details: body,
      requestId,
    });
  }

  return parseResponseBody(res) as Promise<T>;
}

export async function apiFetchRaw(path: string, options?: ApiFetchOptions): Promise<Response> {
  const timeoutMs = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const baseCandidates = getApiBaseCandidates();
  const candidateUrls = baseCandidates.length > 0 ? baseCandidates.map((base) => buildApiUrl(base, path)) : [apiUrl(path)];
  let lastError: unknown;
  const startedAt = Date.now();

  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    const controller = new AbortController();
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(1, effectiveTimeoutMs - elapsedMs);
    const timeout = setTimeout(() => controller.abort(), remainingMs);

    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      console.info(`[apiFetchRaw] Attempt ${index + 1}/${candidateUrls.length}: ${url}`);
    }

    try {
      const res = await fetch(url, {
        ...options,
        signal: options?.signal ?? controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (error: unknown) {
      clearTimeout(timeout);
      lastError = error;

      // If fallback base ports are enabled in dev mode, try the next candidate on connection failures.
      const shouldTryNext =
        index < candidateUrls.length - 1 && !(options?.signal?.aborted === true);
      if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[apiFetchRaw] Failed ${url} -> ${reason}`);
      }
      if (shouldTryNext) {
        continue;
      }
    }
  }

  if (lastError instanceof Error && lastError.name === "AbortError") {
    if (!options?.suppressGlobalErrors) {
      getGlobalErrorDispatch()?.appError?.({
        type: "network",
        message: "A ligação demorou demasiado tempo. Verifique a sua internet e tente novamente.",
        action: "retry",
      });
    }
    throw new ApiError(
      "A ligação demorou demasiado tempo. Verifique a sua internet e tente novamente.",
      { isNetworkError: true }
    );
  }

  if (!options?.suppressGlobalErrors) {
    getGlobalErrorDispatch()?.appError?.({
      type: "network",
      message: "Não foi possível ligar ao servidor.",
      action: "retry",
    });
  }
  throw new ApiError("Não foi possível ligar-se ao serviço. Verifique a sua ligação e tente novamente.", {
    details: lastError,
    isNetworkError: true,
  });
}

export function authFetch<T = unknown>(path: string, token: string, options?: ApiFetchOptions): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export function authFetchRaw(path: string, token: string, options?: ApiFetchOptions): Promise<Response> {
  return apiFetchRaw(path, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  touchClientSession();
}

export function clearToken() {
  clearSessionData();
  recordLogoutSignal();
  notifySessionChange("logout");
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: Record<string, unknown>) {
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

/** Login route appropriate for the current path (admin areas -> admin login). */
export function loginRouteForCurrentPath(): string {
  if (typeof window === "undefined") return "/Login";
  const path = window.location.pathname || "";
  return path.startsWith("/Portal/Admin") || path.startsWith("/Admin") ? "/Admin/Login" : "/Login";
}

/**
 * Log the user out. Optimistic by design: the local session is cleared FIRST so
 * the UI reflects logout instantly — we never block the user on a network
 * round-trip (backend logout is stateless; the JWT simply stops being sent).
 *
 * By default it then hard-navigates to the login screen, which guarantees a
 * clean state (no stale React/React-Query/Google-session memory survives).
 * Pass { redirect: false } to handle navigation yourself, or { redirectTo }
 * to control the destination (e.g. an expiry reason on the query string).
 */
export function logoutCurrentSession(
  token?: string | null,
  options?: { redirect?: boolean; redirectTo?: string },
): void {
  // 1) Clear local session immediately (also signals other tabs + listeners).
  clearToken();

  // 2) Best-effort server notification — fire-and-forget, never awaited.
  if (token) {
    try {
      void authFetchRaw("/auth/logout", token, {
        method: "POST",
        suppressGlobalErrors: true,
      }).catch(() => {
        /* logout already succeeded locally; ignore network failures */
      });
    } catch {
      /* never let logout throw */
    }
  }

  // 3) Navigate to login (hard reload) unless the caller opts out.
  if (options?.redirect !== false && typeof window !== "undefined") {
    window.location.assign(options?.redirectTo || loginRouteForCurrentPath());
  }
}
