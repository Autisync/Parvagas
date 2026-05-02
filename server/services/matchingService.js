export const calculateProfileCompletion = (profile) => {
  const keys = [
    "fullName",
    "email",
    "phone",
    "location",
    "nationality",
    "professionalTitle",
    "summary",
    "skills",
    "experience",
    "education",
    "languages",
    "preferredRoles",
  ];

  const completed = keys.filter((key) => {
    const value = profile[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim());
  }).length;

  return Math.round((completed / keys.length) * 100);
};

export const calculateJobMatch = ({ profile, job }) => {
  const profileSkills = new Set((profile.skills || []).map((s) => s.toLowerCase()));
  const requiredSkills = (job.requiredSkills || []).map((s) => s.toLowerCase());
  const preferredSkills = (job.preferredSkills || []).map((s) => s.toLowerCase());

  const requiredHit = requiredSkills.filter((s) => profileSkills.has(s)).length;
  const preferredHit = preferredSkills.filter((s) => profileSkills.has(s)).length;

  const requiredWeight = requiredSkills.length ? (requiredHit / requiredSkills.length) * 70 : 35;
  const preferredWeight = preferredSkills.length ? (preferredHit / preferredSkills.length) * 20 : 10;
  const locationBonus = (profile.preferredLocations || []).includes(job.provinceCity) ? 10 : 0;
  const score = Math.min(100, Math.round(requiredWeight + preferredWeight + locationBonus));

  const explanation = `Compatibilidade baseada em ${requiredHit}/${requiredSkills.length || 0} competências obrigatórias, ${preferredHit}/${preferredSkills.length || 0} competências preferenciais e aderência de localização.`;

  return { score, explanation };
};
