/**
 * CvParserBase — abstract base class for all CV parsing adapters.
 *
 * All concrete parsers (Skima, ApyHub, ManualFallback, …) must extend this
 * class and implement `parseResume()`.  The return value is always a
 * `NormalizedCvData` object so that consuming code never has to know which
 * provider is active.
 *
 * NormalizedCvData shape:
 * {
 *   fullName:         string,
 *   email:            string,
 *   phone:            string,
 *   location:         string,
 *   nationality:      string,
 *   professionalTitle:string,
 *   summary:          string,
 *   experience:       ExperienceItem[],
 *   education:        EducationItem[],
 *   skills:           string[],
 *   languages:        string[],
 *   certifications:   string[],
 *   preferredRoles:   string[],
 *   preferredLocations:string[],
 *   preferredJobType: string,
 *   availability:     string,
 *   expectedSalaryAoa:number|null,
 * }
 *
 * ExperienceItem: { jobTitle, company, location, startDate, endDate, current, description }
 * EducationItem:  { degree, institution, location, startDate, endDate, description }
 */

export class CvParserBase {
  /**
   * Parse a CV file and return a normalized profile.
   *
   * @param {Buffer}  buffer   — raw file bytes
   * @param {string}  fileName — original file name, used for extension detection
   * @param {string}  mimeType — MIME type of the uploaded file
   * @returns {Promise<{ profile: NormalizedCvData, provider: string, missingFields: string[] }>}
   */
  // eslint-disable-next-line no-unused-vars
  async parseResume(buffer, fileName, mimeType) {
    throw new Error(`${this.constructor.name}.parseResume() is not implemented.`);
  }

  /**
   * Returns a blank NormalizedCvData so subclasses can spread their results on top.
   * All fields default to empty-but-type-correct values so consumers never see
   * undefined for any key.
   */
  static emptyProfile() {
    return {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      nationality: "",
      professionalTitle: "",
      summary: "",
      experience: [],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
      preferredRoles: [],
      preferredLocations: [],
      preferredJobType: "",
      availability: "",
      expectedSalaryAoa: null,
    };
  }

  /**
   * Calculates which required top-level fields are still empty/missing.
   * Subclasses should call this before returning from parseResume() so the
   * caller always gets a consistent `missingFields` array.
   */
  static missingFields(profile) {
    const required = [
      "fullName",
      "email",
      "phone",
      "location",
      "professionalTitle",
      "summary",
      "experience",
      "education",
      "skills",
      "languages",
      "certifications",
    ];

    return required.filter((key) => {
      const value = profile[key];
      if (Array.isArray(value)) return value.length === 0;
      return !String(value ?? "").trim();
    });
  }

  /**
   * Safely coerce a raw value from an API response into a trimmed string.
   */
  static str(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  /**
   * Safely coerce a raw API value into a flat string array.
   * Handles: string[], string (comma-separated), or null/undefined.
   * Non-string non-null items (objects) are returned as-is so that
   * callers can map over arrays of experience/education/skill objects.
   */
  static arr(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => item !== null && item !== undefined && item !== "");
    }
    if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  }

  /**
   * Map a free-form date string to YYYY-MM format for consistent storage.
   * Returns "" when the input cannot be parsed.
   */
  static normalizeDate(value) {
    if (!value) return "";
    const s = String(value).trim();
    // Already YYYY-MM
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    // YYYY-MM-DD or ISO datetime
    const m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    // MM/YYYY or MM-YYYY
    const slashY = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (slashY) return `${slashY[2]}-${slashY[1].padStart(2, "0")}`;
    // YYYY only
    if (/^\d{4}$/.test(s)) return `${s}-01`;
    // Month Year e.g. "Jan 2022"
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mWord = s.match(/(\w{3})\w*\s+(\d{4})/i);
    if (mWord) {
      const mon = months[mWord[1].toLowerCase()];
      if (mon) return `${mWord[2]}-${mon}`;
    }
    return "";
  }
}
