export function updateItemsByIds<T extends { _id: string }>(
  items: T[],
  ids: string[],
  updater: (item: T) => T,
) {
  const idSet = new Set(ids);
  return items.map((item) => (idSet.has(item._id) ? updater(item) : item));
}

const COMPANY_STATUS_ALIASES: Record<string, "active" | "pending_verification" | "rejected" | "inactive"> = {
  active: "active",
  ativa: "active",
  ativo: "active",
  approved: "active",
  pending: "pending_verification",
  pendente: "pending_verification",
  pending_verification: "pending_verification",
  pendingverification: "pending_verification",
  rejected: "rejected",
  rejeitada: "rejected",
  rejeitado: "rejected",
  inactive: "inactive",
  inativa: "inactive",
  inativo: "inactive",
};

export function normalizeCompanyStatusInput(status: string) {
  const normalized = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  return COMPANY_STATUS_ALIASES[normalized] || normalized;
}

export function requiresReasonForCompanyStatus(status: string) {
  const normalized = normalizeCompanyStatusInput(status);
  return normalized === "rejected" || normalized === "inactive";
}

export function buildCompanyStatusPayload(status: string, reason: string) {
  const normalizedStatus = normalizeCompanyStatusInput(status);

  if (requiresReasonForCompanyStatus(status) && !String(reason || "").trim()) {
    throw new Error("Este estado exige um motivo antes de continuar.");
  }

  return {
    status: normalizedStatus,
    reason: String(reason || "").trim(),
  };
}
