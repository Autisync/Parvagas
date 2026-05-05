/**
 * parseCvToProfile — delegates to the active CV parser configured by
 * RESUME_PARSER_PROVIDER (default: "skima").
 *
 * Signature changed from (text: string) to (file: multer file object) so that
 * API-based parsers can pass the raw buffer directly without a text extraction
 * step.  ManualFallbackParser handles text extraction internally when needed.
 *
 * @param {{ buffer: Buffer, originalname: string, mimetype: string }} file
 * @returns {Promise<{ provider: string, profile: object, missingFields: string[], fallbackUsed?: boolean }>}
 */
export const parseCvToProfile = async (file) => {
  const { parseCvFile } = await import("./parsers/cvParserFactory.js");
  return parseCvFile(file);
};

export const generateApplicationSummaryDraft = async ({ profile, job }) => {
  const summary = `Sou ${profile.fullName || "candidato"}, com foco em ${
    profile.professionalTitle || "resultados"
  }. Gostaria de contribuir para a vaga ${job.title} com as competências: ${(profile.skills || [])
    .slice(0, 5)
    .join(", ")}.`;
  return summary;
};

export const generateProfessionalSummaryDraft = async (profile = {}) => {
  const normalizedSkills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean).slice(0, 6) : [];
  const latestExperience = Array.isArray(profile.experience)
    ? profile.experience.find((item) => item?.jobTitle || item?.role || item?.title)
    : null;
  const latestEducation = Array.isArray(profile.education)
    ? profile.education.find((item) => item?.degree || item?.institution)
    : null;

  const parts = [
    profile.professionalTitle
      ? `${profile.professionalTitle} com base em ${profile.location || "Angola"}.`
      : "Profissional com experiência em evolução.",
    latestExperience
      ? `Experiência recente como ${latestExperience.jobTitle || latestExperience.role || latestExperience.title}${latestExperience.company ? ` na ${latestExperience.company}` : ""}.`
      : "Perfil em fase de consolidação profissional.",
    normalizedSkills.length > 0 ? `Competências-chave: ${normalizedSkills.join(", ")}.` : "",
    latestEducation?.degree
      ? `Formação em ${latestEducation.degree}${latestEducation.institution ? ` pela ${latestEducation.institution}` : ""}.`
      : "",
    profile.availability ? `Disponibilidade: ${String(profile.availability).replace(/_/g, " ")}.` : "",
  ].filter(Boolean);

  return {
    draft: parts.join(" ").slice(0, 600),
    warning: "Revise sempre o texto antes de guardar.",
  };
};

export const generateFieldSpecificCvProfile = async ({ profile, targetField, jobDescription = "" }) => {
  const normalizedField = String(targetField || "").trim();
  const baseSkills = Array.isArray(profile.skills) ? profile.skills : [];
  const keywordsFromDescription = String(jobDescription || "")
    .split(/[^a-zA-Z0-9À-ÿ+#.]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 12);

  const keywordSet = new Set([
    normalizedField,
    ...baseSkills.slice(0, 12),
    ...keywordsFromDescription,
  ]);

  const professionalSummary = [
    `${profile.fullName || "Candidato"} com foco em ${normalizedField}.`,
    profile.summary || profile.bio || "Perfil orientado para resultados e colaboração.",
    jobDescription ? `Objetivo alinhado à vaga: ${jobDescription.slice(0, 220)}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 900);

  const experienceHighlights = (Array.isArray(profile.experience) ? profile.experience : [])
    .slice(0, 5)
    .map((item) => {
      if (typeof item === "string") return item;
      const role = String(item?.role || item?.title || "Experiência").trim();
      const company = String(item?.company || "").trim();
      const achievement = String(item?.achievement || item?.description || "").trim();
      return [role, company, achievement].filter(Boolean).join(" - ");
    })
    .filter(Boolean);

  const coverLetterDraft = `Prezada equipa de recrutamento,\n\nCandidato-me para oportunidades na área de ${normalizedField}. Trago experiência em ${baseSkills
    .slice(0, 6)
    .join(", ")} e acredito poder contribuir com impacto desde o início.\n\nAtenciosamente,\n${profile.fullName || "Candidato"}`;

  return {
    label: `${normalizedField} CV Profile`,
    professionalSummary,
    keySkills: Array.from(keywordSet).slice(0, 15),
    experienceHighlights,
    suggestedKeywords: Array.from(keywordSet).slice(0, 20),
    coverLetterDraft,
  };
};
