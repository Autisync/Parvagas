export type ExperienceEntry = {
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
};

export type EducationEntry = {
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type ParsedCvProfile = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  postcode: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  professionalSummary: string;
  summary: string;
  jobTitle: string;
  professionalTitle: string;
  yearsOfExperience: number | null;
  skills: string[];
  workExperience: ExperienceEntry[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: string[];
  languages: string[];
  portfolioLinks: string[];
  preferredJobType: string;
  availability: string;
  expectedSalaryAoa: number | null;
  nationality: string;
  [key: string]: unknown;
};

export type CvProfileMergeResult<T extends Record<string, unknown>> = {
  profile: T;
  appliedFields: string[];
};

const EMPTY_PROFILE: ParsedCvProfile = {
  firstName: "",
  lastName: "",
  fullName: "",
  email: "",
  phone: "",
  location: "",
  postcode: "",
  linkedinUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  professionalSummary: "",
  summary: "",
  jobTitle: "",
  professionalTitle: "",
  yearsOfExperience: null,
  skills: [],
  workExperience: [],
  experience: [],
  education: [],
  certifications: [],
  languages: [],
  portfolioLinks: [],
  preferredJobType: "",
  availability: "",
  expectedSalaryAoa: null,
  nationality: "",
};

const toText = (value: unknown) => String(value ?? "").trim();

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = toText(typeof item === "string" ? item : (item as { name?: unknown; skill?: unknown; label?: unknown; title?: unknown })?.name ?? (item as { name?: unknown; skill?: unknown; label?: unknown; title?: unknown })?.skill ?? (item as { name?: unknown; skill?: unknown; label?: unknown; title?: unknown })?.label ?? (item as { name?: unknown; skill?: unknown; label?: unknown; title?: unknown })?.title);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
};

const toExperienceArray = (value: unknown): ExperienceEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const source = item as Record<string, unknown>;
      return {
        jobTitle: toText(source.jobTitle || source.title || source.role),
        company: toText(source.company || source.employer),
        location: toText(source.location),
        startDate: toText(source.startDate || source.start_date || source.from),
        endDate: toText(source.endDate || source.end_date || source.to),
        current: Boolean(source.current || source.is_current || (!source.endDate && !source.end_date && !source.to)),
        description: toText(source.description || source.summary || source.responsibilities),
      };
    })
    .filter((item) => item.jobTitle || item.company);
};

const toEducationArray = (value: unknown): EducationEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const source = item as Record<string, unknown>;
      return {
        degree: toText(source.degree || source.course || source.qualification),
        institution: toText(source.institution || source.school || source.university),
        location: toText(source.location),
        startDate: toText(source.startDate || source.start_date || source.from),
        endDate: toText(source.endDate || source.end_date || source.to),
        description: toText(source.description || source.notes),
      };
    })
    .filter((item) => item.degree || item.institution);
};

const parseFullName = (value: string) => {
  const cleaned = toText(value).replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "", lastName: "", fullName: "" };
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: cleaned, lastName: "", fullName: cleaned };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: cleaned,
  };
};

const pickFirstUrl = (items: string[], pattern: RegExp) => items.find((item) => pattern.test(item)) || "";

const uniqueStrings = (...values: Array<string | string[] | null | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const text = toText(item);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(text);
    }
  }
  return result;
};

export function normalizeParsedCvProfile(raw: Record<string, unknown> = {}): ParsedCvProfile {
  const source = raw as Record<string, unknown>;
  const firstNameValue = source.firstName || source.first_name || "";
  const lastNameValue = source.lastName || source.last_name || "";
  const derivedName = parseFullName(
    toText(source.fullName || source.full_name || source.name || `${firstNameValue} ${lastNameValue}`.trim())
  );

  const jobTitle = toText(
    source.jobTitle || source.job_title || source.professionalTitle || source.professional_title || source.title
  );
  const professionalSummary = toText(
    source.professionalSummary || source.professional_summary || source.summary || source.bio
  );
  const workExperience = toExperienceArray(
    source.workExperience || source.work_experience || source.experience || source.experiences
  );
  const education = toEducationArray(source.education || source.educational_background);
  const portfolioLinks = uniqueStrings(source.portfolioLinks as string[] | undefined, source.portfolio_links as string[] | undefined);
  const linkedinUrl = toText(source.linkedinUrl || source.linkedin_url || source.linkedin) || pickFirstUrl(portfolioLinks, /linkedin\.com/i);
  const githubUrl = toText(source.githubUrl || source.github_url || source.github) || pickFirstUrl(portfolioLinks, /github\.com/i);
  const portfolioUrl =
    toText(source.portfolioUrl || source.portfolio_url || source.website || source.portfolio) ||
    pickFirstUrl(portfolioLinks, /(portfolio|behance|dribbble|medium\.com|substack|notion\.site)/i) ||
    pickFirstUrl(portfolioLinks, /^https?:\/\//i);

  return {
    ...EMPTY_PROFILE,
    firstName: toText(source.firstName || source.first_name || derivedName.firstName),
    lastName: toText(source.lastName || source.last_name || derivedName.lastName),
    fullName: derivedName.fullName,
    email: toText(source.email || source.email_address).toLowerCase(),
    phone: toText(source.phone || source.phone_number || source.mobile || source.contactPhone),
    location: toText(source.location || source.city || source.town),
    postcode: toText(source.postcode || source.post_code || source.zipCode || source.zip_code || source.zip || source.postalCode),
    linkedinUrl,
    portfolioUrl,
    githubUrl,
    professionalSummary,
    summary: professionalSummary,
    jobTitle,
    professionalTitle: toText(source.professionalTitle || source.professional_title || jobTitle),
    yearsOfExperience: toNumber(source.yearsOfExperience),
    skills: toStringArray(source.skills),
    workExperience,
    experience: workExperience,
    education,
    certifications: toStringArray(source.certifications),
    languages: toStringArray(source.languages),
    portfolioLinks: uniqueStrings(portfolioLinks, linkedinUrl, portfolioUrl, githubUrl),
    preferredJobType: toText(source.preferredJobType || source.preferred_job_type),
    availability: toText(source.availability || source.availability_status),
    expectedSalaryAoa: toNumber(source.expectedSalaryAoa ?? source.salaryExpectation ?? source.salary),
    nationality: toText(source.nationality),
  };
}

function isEmptyValue(value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  if (value === null || value === undefined) return true;
  return String(value).trim().length === 0;
}

export function applyParsedCvDraftToProfile<T extends Record<string, unknown>>(
  currentProfile: T,
  parsedProfile: Record<string, unknown>
): CvProfileMergeResult<T> {
  const normalized = normalizeParsedCvProfile(parsedProfile);
  const nextProfile = { ...currentProfile } as T;
  const appliedFields: string[] = [];

  const setIfEmpty = (fieldName: string, value: unknown) => {
    if (!isEmptyValue((nextProfile as Record<string, unknown>)[fieldName]) || isEmptyValue(value)) {
      return;
    }
    (nextProfile as Record<string, unknown>)[fieldName] = value;
    appliedFields.push(fieldName);
  };

  setIfEmpty("firstName", normalized.firstName);
  setIfEmpty("lastName", normalized.lastName);
  setIfEmpty("fullName", normalized.fullName);
  setIfEmpty("email", normalized.email);
  setIfEmpty("phone", normalized.phone);
  setIfEmpty("location", normalized.location);
  setIfEmpty("postcode", normalized.postcode);
  setIfEmpty("linkedinUrl", normalized.linkedinUrl);
  setIfEmpty("portfolioUrl", normalized.portfolioUrl);
  setIfEmpty("githubUrl", normalized.githubUrl);
  setIfEmpty("professionalSummary", normalized.professionalSummary);
  setIfEmpty("summary", normalized.summary);
  setIfEmpty("jobTitle", normalized.jobTitle);
  setIfEmpty("professionalTitle", normalized.professionalTitle);
  setIfEmpty("yearsOfExperience", normalized.yearsOfExperience);
  setIfEmpty("skills", normalized.skills);
  setIfEmpty("workExperience", normalized.workExperience);
  setIfEmpty("experience", normalized.experience);
  setIfEmpty("education", normalized.education);
  setIfEmpty("certifications", normalized.certifications);
  setIfEmpty("languages", normalized.languages);
  setIfEmpty("portfolioLinks", normalized.portfolioLinks);
  setIfEmpty("preferredJobType", normalized.preferredJobType);
  setIfEmpty("availability", normalized.availability);
  setIfEmpty("expectedSalaryAoa", normalized.expectedSalaryAoa);
  setIfEmpty("nationality", normalized.nationality);

  if (isEmptyValue((nextProfile as Record<string, unknown>).fullName) && (normalized.firstName || normalized.lastName)) {
    const composed = `${normalized.firstName} ${normalized.lastName}`.trim();
    if (composed) {
      (nextProfile as Record<string, unknown>).fullName = composed;
      appliedFields.push("fullName");
    }
  }

  if (isEmptyValue((nextProfile as Record<string, unknown>).jobTitle) && normalized.professionalTitle) {
    (nextProfile as Record<string, unknown>).jobTitle = normalized.professionalTitle;
    appliedFields.push("jobTitle");
  }
  if (isEmptyValue((nextProfile as Record<string, unknown>).professionalTitle) && normalized.jobTitle) {
    (nextProfile as Record<string, unknown>).professionalTitle = normalized.jobTitle;
    appliedFields.push("professionalTitle");
  }
  if (isEmptyValue((nextProfile as Record<string, unknown>).summary) && normalized.professionalSummary) {
    (nextProfile as Record<string, unknown>).summary = normalized.professionalSummary;
    appliedFields.push("summary");
  }
  if (isEmptyValue((nextProfile as Record<string, unknown>).professionalSummary) && normalized.summary) {
    (nextProfile as Record<string, unknown>).professionalSummary = normalized.summary;
    appliedFields.push("professionalSummary");
  }

  return {
    profile: nextProfile,
    appliedFields: Array.from(new Set(appliedFields)),
  };
}

export { EMPTY_PROFILE as EMPTY_PARSED_CV_PROFILE };
