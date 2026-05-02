const profileFields = [
  "fullName",
  "email",
  "phone",
  "location",
  "nationality",
  "professionalTitle",
  "summary",
  "experience",
  "education",
  "skills",
  "languages",
  "certifications",
  "preferredRoles",
  "preferredLocations",
  "availability",
  "expectedSalary",
];

const extractEmail = (text) => text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0] || "";
const extractPhone = (text) => text.match(/\+?\d[\d\s()-]{7,}/)?.[0] || "";

export const parseCvToProfile = async (text) => {
  const provider = process.env.AI_PROVIDER || "fallback";

  // Adapter boundary: replace this fallback with real provider integration.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const fullName = lines[0] || "";
  const professionalTitle = lines[1] || "";
  const skills = lines
    .filter((line) => /skills|compet[êe]ncias|tecnologias/i.test(line))
    .flatMap((line) => line.split(":").slice(1).join(":").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const profile = {
    fullName,
    email: extractEmail(text),
    phone: extractPhone(text),
    location: "Angola",
    nationality: "",
    professionalTitle,
    summary: lines.slice(2, 6).join(" ").slice(0, 500),
    experience: [],
    education: [],
    skills,
    languages: [],
    certifications: [],
    preferredRoles: professionalTitle ? [professionalTitle] : [],
    preferredLocations: ["Luanda"],
    availability: "",
    expectedSalary: "",
  };

  return {
    provider,
    profile,
    missingFields: profileFields.filter((field) => {
      const value = profile[field];
      return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    }),
  };
};

export const generateApplicationSummaryDraft = async ({ profile, job }) => {
  const summary = `Sou ${profile.fullName || "candidato"}, com foco em ${
    profile.professionalTitle || "resultados"
  }. Gostaria de contribuir para a vaga ${job.title} com as competências: ${(profile.skills || [])
    .slice(0, 5)
    .join(", ")}.`;
  return summary;
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
