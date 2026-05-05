/**
 * SkimaParser — CV parsing adapter for Skima AI.
 *
 * Skima AI resume parser API:
 *   POST https://parser.skima.ai/api/parse-resume
 *   Authorization: Bearer <SKIMA_API_KEY>
 *   Content-Type: multipart/form-data
 *   Body field: "resume" (file)
 *
 * Skima supports: PDF, DOCX, DOC, HTML, TXT, and common image formats.
 *
 * Reference: https://docs.skima.ai  (sign up at https://skima.ai for a free key)
 *
 * Set the environment variable:
 *   SKIMA_API_KEY=sk_live_xxxxxxxxxxxxx
 */

import { CvParserBase } from "./CvParserBase.js";
import { CvParserService } from "./CvParserService.js";

const SKIMA_ENDPOINT = "https://parser.skima.ai/api/parse-resume";
const REQUEST_TIMEOUT_MS = 30_000;

export class SkimaParser extends CvParserService {
  constructor() {
    super();
    this.apiKey = process.env.SKIMA_API_KEY || "";
  }

  /**
   * @param {Buffer}  buffer
   * @param {string}  fileName
   * @param {string}  mimeType
   */
  providerName() {
    return "skima";
  }

  async parse(buffer, fileName, mimeType) {
    if (!this.apiKey) {
      throw new Error(
        "SKIMA_API_KEY is not configured. Add it to your .env file or switch to RESUME_PARSER_PROVIDER=manual."
      );
    }

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append("resume", blob, fileName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let raw;
    try {
      const res = await fetch(SKIMA_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Skima API error ${res.status}: ${text.slice(0, 200)}`);
      }

      raw = await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Skima API request timed out.");
      throw err;
    }

    return this._mapResponse(raw);
  }

  /**
   * Map Skima AI response to NormalizedCvData.
   *
   * Skima returns a nested `data` object.  Key paths used:
   *   data.name / data.contact.name
   *   data.contact.email
   *   data.contact.phone
   *   data.contact.location / data.contact.address
   *   data.contact.nationality
   *   data.title / data.objective
   *   data.summary / data.profile
   *   data.experience[]  →  { title, company, location, start_date, end_date, is_current, description }
   *   data.education[]   →  { degree, institution, location, start_date, end_date, description }
   *   data.skills[]      →  string | { name }
   *   data.languages[]   →  string | { name }
   *   data.certifications[] → string | { name }
   *
   * If Skima changes their response shape, update only this method.
   */
  _mapResponse(raw) {
    const data = raw?.data ?? raw ?? {};
    const contact = data.contact ?? {};

    const experiences = CvParserBase.arr(data.experience).map((item) => ({
      title: CvParserBase.str(item.title ?? item.job_title ?? item.position),
      company: CvParserBase.str(item.company ?? item.employer ?? item.organization),
      location: CvParserBase.str(item.location),
      startDate: CvParserBase.normalizeDate(item.start_date ?? item.from),
      endDate: CvParserBase.normalizeDate(item.end_date ?? item.to),
      current: Boolean(item.is_current ?? item.current ?? (!item.end_date && !item.to)),
      description: CvParserBase.str(item.description ?? item.summary ?? item.responsibilities),
    })).filter((e) => e.title || e.company);

    const education = CvParserBase.arr(data.education).map((item) => ({
      degree: CvParserBase.str(item.degree ?? item.qualification ?? item.field_of_study),
      institution: CvParserBase.str(item.institution ?? item.school ?? item.university),
      location: CvParserBase.str(item.location),
      startDate: CvParserBase.normalizeDate(item.start_date ?? item.from),
      endDate: CvParserBase.normalizeDate(item.end_date ?? item.to),
      description: CvParserBase.str(item.description ?? item.notes),
    })).filter((e) => e.degree || e.institution);

    const pickName = (item) => (typeof item === "string" ? item : CvParserBase.str(item?.name ?? item?.skill ?? item?.language ?? item?.certification));

    return {
      ...CvParserService.emptyParsed(),
      name: CvParserBase.str(contact.name ?? data.name ?? data.full_name),
      email: CvParserBase.str(contact.email ?? data.email).toLowerCase(),
      phone: CvParserBase.str(contact.phone ?? contact.mobile ?? data.phone),
      location: CvParserBase.str(contact.location ?? contact.address ?? data.location ?? data.address),
      nationality: CvParserBase.str(contact.nationality ?? data.nationality),
      title: CvParserBase.str(data.title ?? data.headline ?? data.objective),
      summary: CvParserBase.str(data.summary ?? data.profile ?? data.about),
      objective: CvParserBase.str(data.objective ?? data.career_objective ?? data.goal),
      experiences,
      education,
      skills: CvParserBase.arr(data.skills).map(pickName).filter(Boolean),
      languages: CvParserBase.arr(data.languages).map(pickName).filter(Boolean),
      certifications: CvParserBase.arr(data.certifications ?? data.certificates).map(pickName).filter(Boolean),
      preferredJobType: CvParserBase.str(data.preferred_job_type ?? data.preferences?.jobType ?? data.preferences?.preferredJobType),
      availability: CvParserBase.str(data.availability ?? data.preferences?.availability),
      expectedSalaryAoa: data.expected_salary_aoa ?? data.expectedSalaryAoa ?? data.preferences?.salaryExpectation,
    };
  }
}
