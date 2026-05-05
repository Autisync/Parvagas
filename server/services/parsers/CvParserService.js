import { CvParserBase } from "./CvParserBase.js";

/**
 * CvParserService interface.
 *
 * All provider adapters must implement parse(fileBuffer, fileName, mimeType)
 * and return a normalized resume payload in this shape:
 * {
 *   name, email, phone, title, summary,
 *   skills[], languages[], certifications[],
 *   experiences[], education[], preferredJobType, availability
 * }
 */
export class CvParserService extends CvParserBase {
  // eslint-disable-next-line no-unused-vars
  async parse(fileBuffer, fileName, mimeType) {
    throw new Error(`${this.constructor.name}.parse() is not implemented.`);
  }

  providerName() {
    return "unknown";
  }

  async parseResume(fileBuffer, fileName, mimeType) {
    const parsed = await this.parse(fileBuffer, fileName, mimeType);
    const profile = CvParserService.toProfileDraft(parsed);
    return {
      provider: this.providerName(),
      profile,
      parsed,
      missingFields: CvParserBase.missingFields(profile),
    };
  }

  static emptyParsed() {
    return {
      name: "",
      email: "",
      phone: "",
      location: "",
      nationality: "",
      title: "",
      summary: "",
      objective: "",
      skills: [],
      languages: [],
      certifications: [],
      experiences: [],
      education: [],
      preferredJobType: "",
      availability: "",
      expectedSalaryAoa: null,
    };
  }

  static parseSalaryAoa(value) {
    if (value === null || value === undefined || value === "") return null;
    const digits = String(value).replace(/[^\d]/g, "");
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  static sanitizeSummary(text) {
    const raw = String(text || "");
    return raw
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
      .replace(/\+?\d[\d\s()\-]{7,20}/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/www\.\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  static yearsOfExperience(experiences = []) {
    const nowYear = new Date().getFullYear();
    let minYear = nowYear;
    let maxYear = 0;
    for (const item of experiences) {
      const start = CvParserBase.str(item?.startDate ?? item?.start_date ?? item?.from);
      const end = CvParserBase.str(item?.endDate ?? item?.end_date ?? item?.to);
      const startYear = Number.parseInt(start.slice(0, 4), 10);
      const endYear = item?.current
        ? nowYear
        : Number.parseInt((end || String(nowYear)).slice(0, 4), 10);
      if (Number.isFinite(startYear)) minYear = Math.min(minYear, startYear);
      if (Number.isFinite(endYear)) maxYear = Math.max(maxYear, endYear);
    }
    if (maxYear < minYear) return 0;
    return Math.max(0, maxYear - minYear);
  }

  static buildSummary(normalized) {
    const cleanedProvided = CvParserService.sanitizeSummary(normalized.summary);
    if (cleanedProvided) return cleanedProvided;

    const title = CvParserBase.str(normalized.title);
    const years = CvParserService.yearsOfExperience(normalized.experiences);
    const skills = CvParserBase.arr(normalized.skills)
      .map((item) => (typeof item === "string" ? item : CvParserBase.str(item?.name ?? item?.skill)))
      .filter(Boolean)
      .slice(0, 6);
    const objective = CvParserService.sanitizeSummary(normalized.objective);

    const parts = [
      title ? `${title} com ${years > 0 ? `${years}+ anos` : "experiência"} profissional.` : "Profissional com experiência relevante.",
      skills.length > 0 ? `Competências principais: ${skills.join(", ")}.` : "",
      objective ? `Objetivo: ${objective}.` : "",
    ].filter(Boolean);

    return parts.join(" ").trim();
  }

  static toProfileDraft(parsed = {}) {
    const personalInfo = parsed.personalInfo || {};
    const preferences = parsed.preferences || {};
    const normalized = {
      ...CvParserService.emptyParsed(),
      ...parsed,
      name: parsed.name ?? personalInfo.name,
      email: parsed.email ?? personalInfo.email,
      phone: parsed.phone ?? personalInfo.phone,
      location: parsed.location ?? personalInfo.location,
      preferredJobType: parsed.preferredJobType ?? preferences.jobType,
      availability: parsed.availability ?? preferences.availability,
      expectedSalaryAoa: parsed.expectedSalaryAoa ?? parsed.salary ?? preferences.salary,
      experiences: parsed.experiences ?? parsed.experience,
      education: parsed.education,
      skills: parsed.skills,
      languages: parsed.languages,
      certifications: parsed.certifications,
      summary: parsed.summary,
      objective: parsed.objective ?? preferences.objective,
      title: parsed.title ?? parsed.jobTitle,
    };
    return {
      ...CvParserBase.emptyProfile(),
      fullName: CvParserBase.str(normalized.name),
      email: CvParserBase.str(normalized.email).toLowerCase(),
      phone: CvParserBase.str(normalized.phone),
      location: CvParserBase.str(normalized.location),
      nationality: CvParserBase.str(normalized.nationality),
      professionalTitle: CvParserBase.str(normalized.title),
      summary: CvParserService.buildSummary(normalized),
      skills: CvParserBase.arr(normalized.skills).map((item) => (typeof item === "string" ? item : CvParserBase.str(item?.name))).filter(Boolean),
      languages: CvParserBase.arr(normalized.languages).map((item) => (typeof item === "string" ? item : CvParserBase.str(item?.name))).filter(Boolean),
      certifications: CvParserBase.arr(normalized.certifications).map((item) => (typeof item === "string" ? item : CvParserBase.str(item?.name))).filter(Boolean),
      experience: CvParserBase.arr(normalized.experiences)
        .map((item) => ({
          jobTitle: CvParserBase.str(item?.jobTitle ?? item?.title ?? item?.role),
          company: CvParserBase.str(item?.company ?? item?.employer),
          location: CvParserBase.str(item?.location),
          startDate: CvParserBase.normalizeDate(item?.startDate ?? item?.start_date ?? item?.from),
          endDate: CvParserBase.normalizeDate(item?.endDate ?? item?.end_date ?? item?.to),
          current: Boolean(item?.current ?? item?.is_current ?? (!item?.endDate && !item?.end_date && !item?.to)),
          description: CvParserBase.str(item?.description ?? item?.summary ?? item?.responsibilities),
        }))
        .filter((item) => item.jobTitle || item.company),
      education: CvParserBase.arr(normalized.education)
        .map((item) => ({
          degree: CvParserBase.str(item?.degree ?? item?.course ?? item?.qualification),
          institution: CvParserBase.str(item?.institution ?? item?.school ?? item?.university),
          location: CvParserBase.str(item?.location),
          startDate: CvParserBase.normalizeDate(item?.startDate ?? item?.start_date ?? item?.from),
          endDate: CvParserBase.normalizeDate(item?.endDate ?? item?.end_date ?? item?.to),
          description: CvParserBase.str(item?.description ?? item?.notes),
        }))
        .filter((item) => item.degree || item.institution),
      preferredJobType: CvParserBase.str(normalized.preferredJobType),
      availability: CvParserBase.str(normalized.availability),
      expectedSalaryAoa: CvParserService.parseSalaryAoa(normalized.expectedSalaryAoa),
      preferredRoles: CvParserBase.str(normalized.title) ? [CvParserBase.str(normalized.title)] : [],
    };
  }
}