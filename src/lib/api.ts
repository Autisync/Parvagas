import { getGlobalErrorDispatch } from "@/lib/errorBridge";
import { normalizeErrorMessage } from "@/lib/errorMessage";

const DEV_API_FALLBACK = "http://localhost:6001";

const DEFAULT_TIMEOUT_MS = 20000;

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
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError("Configuração em falta: defina NEXT_PUBLIC_API_URL para ligar ao servidor.");
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getApiBaseUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return DEV_API_FALLBACK;
    return "";
  }

  return process.env.NODE_ENV === "production" ? "" : DEV_API_FALLBACK;
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

export async function apiFetch<T = unknown>(
  path: string,
  options?: ApiFetchOptions
): Promise<T> {
  const res = await apiFetchRaw(path, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const body = await parseResponseBody(res);
    const requestId = res.headers.get("x-request-id") || undefined;
    const messageFromBody = typeof (body as { error?: unknown })?.error === "string" ? String((body as { error?: string }).error) : "";
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
        getGlobalErrorDispatch()?.appError?.({
          type: "auth",
          message: "A sua sessão expirou. Faça login novamente.",
          action: "login",
        });
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl(path), {
      ...options,
      signal: options?.signal ?? controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      if (!options?.suppressGlobalErrors) {
        getGlobalErrorDispatch()?.appError?.({
          type: "network",
          message: "A ligação ao servidor expirou. Verifique a internet e tente novamente.",
          action: "retry",
        });
      }
      throw new ApiError("A ligação expirou. Verifique a rede e tente novamente.", { isNetworkError: true });
    }
    if (!options?.suppressGlobalErrors) {
      getGlobalErrorDispatch()?.appError?.({
        type: "network",
        message: "Não foi possível ligar ao servidor.",
        action: "retry",
      });
    }
    throw new ApiError("Não foi possível ligar ao servidor. Verifique a sua ligação.", {
      details: error,
      isNetworkError: true,
    });
  }
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
  return localStorage.getItem("parvagas_token");
}

export function setToken(token: string) {
  localStorage.setItem("parvagas_token", token);
}

export function clearToken() {
  localStorage.removeItem("parvagas_token");
  localStorage.removeItem("parvagas_user");
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("parvagas_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: Record<string, unknown>) {
  localStorage.setItem("parvagas_user", JSON.stringify(user));
}
