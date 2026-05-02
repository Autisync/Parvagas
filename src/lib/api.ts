import { getGlobalErrorDispatch } from "@/lib/errorBridge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const DEFAULT_TIMEOUT_MS = 20000;

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
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
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
  options?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;

  try {
    res = await fetch(apiUrl(path), {
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
      ...options,
      signal: options?.signal ?? controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      getGlobalErrorDispatch()?.banner(
        "A ligação ao servidor expirou. Verifique a internet e tente novamente.",
        "Reconectar",
      );
      throw new ApiError("A ligação expirou. Verifique a rede e tente novamente.", { isNetworkError: true });
    }
    getGlobalErrorDispatch()?.banner(
      "Não foi possível estabelecer ligação com o servidor.",
      "Reconectar",
    );
    throw new ApiError("Não foi possível ligar ao servidor. Verifique a sua ligação.", {
      details: error,
      isNetworkError: true,
    });
  }

  clearTimeout(timeout);

  if (!res.ok) {
    const body = await parseResponseBody(res);
    const requestId = res.headers.get("x-request-id") || undefined;
    const messageFromBody = typeof (body as { error?: unknown })?.error === "string" ? String((body as { error?: string }).error) : "";
    const message = messageFromBody || fallbackStatusMessage(res.status);

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

    if (res.status >= 500) {
      getGlobalErrorDispatch()?.modal(
        "Serviço temporariamente indisponível",
        "Estamos com instabilidade no servidor. Aguarde alguns instantes e tente novamente.",
        requestId,
      );
    } else if (res.status === 401) {
      getGlobalErrorDispatch()?.banner("A sua sessão expirou. Faça login novamente.", "Reconectar");
    } else {
      getGlobalErrorDispatch()?.toast(message);
    }

    throw new ApiError(message, {
      status: res.status,
      details: body,
      requestId,
    });
  }

  return parseResponseBody(res) as Promise<T>;
}

export function authFetch<T = unknown>(path: string, token: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
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
