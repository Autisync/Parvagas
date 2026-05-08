export const companyVerificationEmailTemplates = {
  approval: {
    subject: "Parvagas | Empresa aprovada",
    body: [
      "Olá {{contactPerson}},",
      "",
      "A sua empresa {{companyName}} foi aprovada.",
      "Pode agora publicar vagas e gerir candidaturas no portal.",
      "",
      "Aceder ao portal: {{portalLink}}",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  more_info: {
    subject: "Parvagas | Informação adicional para verificação",
    body: [
      "Olá {{contactPerson}},",
      "",
      "Para verificar a sua empresa {{companyName}}, precisamos dos seguintes documentos:",
      "- Documento de constituição",
      "- NIF/Identificador fiscal",
      "- Comprovativo de atividade",
      "",
      "Pode responder a este email com os anexos ou aceder a {{verificationLink}}.",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  rejected: {
    subject: "Parvagas | Resultado da verificação da empresa",
    body: [
      "Olá {{contactPerson}},",
      "",
      "Infelizmente, a conta da empresa {{companyName}} foi rejeitada por não cumprir os nossos critérios de validação.",
      "Se considerar existir erro, contacte o suporte para revisão.",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
  inactive: {
    subject: "Parvagas | Conta da empresa inativada",
    body: [
      "Olá {{contactPerson}},",
      "",
      "A conta da empresa {{companyName}} foi inativada temporariamente.",
      "Para reativação, responda a este email com os esclarecimentos solicitados.",
      "",
      "Equipa Parvagas",
    ].join("\n"),
  },
};

export const companyVerificationTemplateLabels = {
  approval: "Aprovar",
  more_info: "Pedir informação adicional",
  rejected: "Rejeitar",
  inactive: "Inativar",
};

export function applyVerificationTemplatePlaceholders(raw, context = {}) {
  return String(raw || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = context[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
