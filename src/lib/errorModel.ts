export type AppErrorType =
  | "network"
  | "auth"
  | "permission"
  | "validation"
  | "server"
  | "rate_limit"
  | "critical";

export type AppErrorAction = "retry" | "login" | "reload";

export type AppError = {
  type: AppErrorType;
  message: string;
  action?: AppErrorAction;
};

export function normalizePtErrorMessage(message: string, type: AppErrorType): string {
  const raw = String(message || "").trim();
  if (raw) return raw;

  if (type === "network") return "Nao foi possivel ligar ao servidor.";
  if (type === "auth") return "A sua sessao expirou. Inicie sessao novamente.";
  if (type === "permission") return "Nao tem permissao para concluir esta acao.";
  if (type === "validation") return "Existem campos invalidos. Reveja os dados.";
  if (type === "rate_limit") return "Demasiadas tentativas. Tente novamente em instantes.";
  if (type === "critical") return "Ocorreu uma falha critica. Tente novamente.";
  return "Nao foi possivel concluir o pedido.";
}
