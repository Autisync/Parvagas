const COMPANY_STATUSES = new Set(["inactive", "pending_verification", "active", "rejected"]);

const COMPANY_STATUS_ALIASES = {
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

const COMPANY_STATUS_TRANSITIONS = {
  pending_verification: new Set(["active", "rejected", "inactive"]),
  active: new Set(["inactive", "rejected"]),
  inactive: new Set(["active", "rejected"]),
  rejected: new Set(["pending_verification", "active"]),
};

export const normalizeCompanyStatusInput = (value) => {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const mapped = COMPANY_STATUS_ALIASES[status] || status;
  return COMPANY_STATUSES.has(mapped) ? mapped : "";
};

export const normalizePersistedCompanyStatus = (value, fallback = "pending_verification") => {
  const normalized = normalizeCompanyStatusInput(value);
  return normalized || fallback;
};

export const canTransitionCompanyStatus = (fromStatus, toStatus) => {
  const from = normalizePersistedCompanyStatus(fromStatus);
  const to = normalizeCompanyStatusInput(toStatus);
  if (!to) return false;
  if (from === to) return true;
  return COMPANY_STATUS_TRANSITIONS[from]?.has(to) || false;
};

export const describeCompanyStatus = (status) => {
  switch (normalizePersistedCompanyStatus(status)) {
    case "active":
      return "ativa";
    case "pending_verification":
      return "pendente";
    case "rejected":
      return "rejeitada";
    case "inactive":
      return "inativa";
    default:
      return String(status || "desconhecido");
  }
};