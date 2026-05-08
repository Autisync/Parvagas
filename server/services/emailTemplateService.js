import EmailTemplate from "../models/emailTemplate.js";

export const TEMPLATE_KEYS = {
  COMPANY_APPROVAL: "company_approval",
  COMPANY_MORE_INFO: "company_more_info",
  COMPANY_REJECTED: "company_rejected",
  COMPANY_MEETING: "company_meeting",
};

const defaults = {
  [TEMPLATE_KEYS.COMPANY_APPROVAL]: {
    subject: "Parvagas | Empresa aprovada",
    body: [
      "Olá {{contactPerson}},",
      "",
      "A conta da empresa {{companyName}} foi aprovada e está ativa no Parvagas.",
      "Já pode publicar vagas e gerir candidaturas.",
      "",
      "Entrar no portal: {{portalLink}}",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  [TEMPLATE_KEYS.COMPANY_MORE_INFO]: {
    subject: "Parvagas | Informação adicional necessária",
    body: [
      "Olá {{contactPerson}},",
      "",
      "Para concluir a verificação da empresa {{companyName}}, precisamos de documentação adicional.",
      "Pode responder a este email com os documentos solicitados.",
      "",
      "Link de verificação: {{verificationLink}}",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  [TEMPLATE_KEYS.COMPANY_REJECTED]: {
    subject: "Parvagas | Resultado da verificação",
    body: [
      "Olá {{contactPerson}},",
      "",
      "A conta da empresa {{companyName}} foi rejeitada/removida após validação.",
      "Se considerar existir erro, contacte suporte.",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  [TEMPLATE_KEYS.COMPANY_MEETING]: {
    subject: "Parvagas | Convite para reunião de verificação",
    body: [
      "Olá {{contactPerson}},",
      "",
      "Gostaríamos de agendar uma reunião rápida para concluir a verificação da empresa {{companyName}}.",
      "Responda com disponibilidade de data e hora.",
      "",
      "Link de verificação: {{verificationLink}}",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
};

export const applyTemplatePlaceholders = (raw, context = {}) => {
  const text = String(raw || "");
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = context[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

export const getEmailTemplate = async (key) => {
  const normalizedKey = String(key || "").trim();
  const saved = await EmailTemplate.findOne({ key: normalizedKey, active: true });
  if (saved) {
    return {
      key: normalizedKey,
      subject: String(saved.subject || ""),
      body: String(saved.body || ""),
    };
  }

  const fallback = defaults[normalizedKey] || { subject: "Parvagas", body: "" };
  return {
    key: normalizedKey,
    subject: fallback.subject,
    body: fallback.body,
  };
};

export const upsertEmailTemplate = async ({ key, subject, body, active = true, updatedByUserId }) => {
  return EmailTemplate.findOneAndUpdate(
    { key: String(key || "").trim() },
    {
      key: String(key || "").trim(),
      subject: String(subject || "").trim(),
      body: String(body || ""),
      active: Boolean(active),
      updatedByUserId: String(updatedByUserId || ""),
    },
    { upsert: true, new: true }
  );
};
