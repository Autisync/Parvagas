const placements = new Set(["homepage_banner", "sidebar", "inline", "newsletter"]);

export const isValidUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const validateAdCampaignPayload = (payload = {}, { partial = false } = {}) => {
  const requiredFields = ["title", "placement", "link", "startDate", "endDate"];
  const missing = requiredFields.filter((field) => !String(payload?.[field] || "").trim());
  if (!partial && missing.length > 0) {
    return `Campos obrigatórios em falta: ${missing.join(", ")}.`;
  }

  if (payload.placement !== undefined && !placements.has(String(payload.placement))) {
    return "placement inválido.";
  }

  if (payload.link !== undefined && !isValidUrl(payload.link)) {
    return "link inválido. Use um URL completo começando por http:// ou https://.";
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : null;
  const endDate = payload.endDate ? new Date(payload.endDate) : null;

  if (payload.startDate !== undefined && (!startDate || Number.isNaN(startDate.getTime()))) {
    return "startDate inválido.";
  }

  if (payload.endDate !== undefined && (!endDate || Number.isNaN(endDate.getTime()))) {
    return "endDate inválido.";
  }

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return "startDate deve ser anterior ou igual a endDate.";
  }

  return "";
};

export const validateSuspensionRequest = ({ actorAdminLevel, actorUserId, targetUserId, suspended, reason }) => {
  if (String(actorAdminLevel || "").trim().toLowerCase() !== "super-admin") {
    return { status: 403, message: "Apenas super-admin pode suspender ou reativar utilizadores." };
  }

  if (typeof suspended !== "boolean") {
    return { status: 400, message: "O campo suspended deve ser booleano." };
  }

  if (!String(reason || "").trim()) {
    return { status: 400, message: "reason é obrigatório para suspender/reativar utilizadores." };
  }

  if (suspended && String(actorUserId || "") === String(targetUserId || "")) {
    return { status: 400, message: "Não pode suspender a sua própria conta." };
  }

  return null;
};