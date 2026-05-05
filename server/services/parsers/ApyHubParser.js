/**
 * ApyHubParser — CV parsing adapter for ApyHub Sharp API.
 *
 * ApyHub resume extraction endpoint:
 *   POST https://api.apyhub.com/extract/resume/file/json
 *   apy-token: <APYHUB_API_KEY>
 *   Content-Type: multipart/form-data
 *   Body field: "file" (PDF or DOCX)
 *
 * ApyHub consumes tokens per request.  Check your quota at:
 *   https://apyhub.com/utility/resume-extractor
 *
 * Set the environment variable:
 *   APYHUB_API_KEY=APY0xxxxxxxxxxxxx
 *
 * Additional ApyHub capabilities (not yet wired — extend here when needed):
 *   - Candidate enrichment  POST /enrich/candidate
 *   - Candidate scoring     POST /score/candidate
 */

import { CvParserBase } from "./CvParserBase.js";
import { CvParserService } from "./CvParserService.js";

const APYHUB_ENDPOINT = "https://api.apyhub.com/extract/resume/file/json";
const REQUEST_TIMEOUT_MS = 30_000;

export class ApyHubParser extends CvParserService {
  constructor() {
    super();
    this.apiKey = process.env.APYHUB_API_KEY || "";
  }

  /**
   * @param {Buffer}  buffer
   * @param {string}  fileName
   * @param {string}  mimeType
   */
  providerName() {
    return "apyhub";
  }

  async parse(buffer, fileName, mimeType) {
    if (!this.apiKey) {
      throw new Error(
        "APYHUB_API_KEY is not configured. Add it to your .env file or switch RESUME_PARSER_PROVIDER."
      );
    }

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append("file", blob, fileName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let raw;
    try {
      const res = await fetch(APYHUB_ENDPOINT, {
        method: "POST",
        headers: { "apy-token": this.apiKey },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ApyHub API error ${res.status}: ${text.slice(0, 200)}`);
      }

      raw = await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("ApyHub API request timed out.");
      throw err;
    }

    return this._mapResponse(raw);
  }

  /**
   * Map ApyHub response to NormalizedCvData.
   *
   * ApyHub wraps results in a `data` key.  Key paths used:
   *   data.name / data.personal_info.name
   *   data.email / data.personal_info.email
   *   data.phone / data.personal_info.phone
   *   data.personal_info.location / address
   *   data.personal_info.nationality
   *   data.title / data.personal_info.title
   *   data.summary / data.personal_info.summary
   *   data.work_experience[] → { title, company, location, start_date, end_date, is_current, responsibilities }
   *   data.education[]       → { degree, institution, location, start_date, end_date }
   *   data.skills[]          → string | { skill }
   *   data.languages[]       → string | { language | name }
   *   data.certifications[]  → string | { name | title }
   *
   * If ApyHub changes their response schema, update only this method.
   */
  _mapResponse(raw) {
    const data   = raw?.data ?? raw ?? {};
    const info   = data.personal_info ?? {};

    const experiences = CvParserBase.arr(data.work_experience ?? data.experience).map((item) => ({
      title: CvParserBase.str(item.title ?? item.job_title ?? item.position ?? item.role),
      company: CvParserBase.str(item.company ?? item.employer ?? item.organization),
      location: CvParserBase.str(item.location),
      startDate: CvParserBase.normalizeDate(item.start_date ?? item.from),
      endDate: CvParserBase.normalizeDate(item.end_date ?? item.to),
      current: Boolean(item.is_current ?? item.current ?? (!item.end_date && !item.to)),
      description: CvParserBase.str(
        Array.isArray(item.responsibilities)
          ? item.responsibilities.join(". ")
          : (item.responsibilities ?? item.description ?? item.summary)
      ),
    })).filter((e) => e.title || e.company);

    const education = CvParserBase.arr(data.education).map((item) => ({
      degree:      CvParserBase.str(item.degree ?? item.qualification ?? item.major ?? item.field_of_study),
      institution: CvParserBase.str(item.institution ?? item.school ?? item.university ?? item.college),
      location:    CvParserBase.str(item.location),
      startDate:   CvParserBase.normalizeDate(item.start_date ?? item.from),
      endDate:     CvParserBase.normalizeDate(item.end_date ?? item.to ?? item.graduation_date),
      description: CvParserBase.str(item.description ?? item.notes),
    })).filter((e) => e.degree || e.institution);

    const pickSkill  = (item) => typeof item === "string" ? item : CvParserBase.str(item?.skill ?? item?.name);
    const pickLang   = (item) => typeof item === "string" ? item : CvParserBase.str(item?.language ?? item?.name);
    const pickCert   = (item) => typeof item === "string" ? item : CvParserBase.str(item?.name ?? item?.title ?? item?.certification);

    return {
      ...CvParserService.emptyParsed(),
      name: CvParserBase.str(info.name ?? data.name ?? data.full_name),
      email: CvParserBase.str(info.email ?? data.email).toLowerCase(),
      phone: CvParserBase.str(info.phone ?? info.mobile ?? data.phone),
      location: CvParserBase.str(info.location ?? info.address ?? info.city ?? data.location),
      nationality: CvParserBase.str(info.nationality ?? data.nationality),
      title: CvParserBase.str(info.title ?? data.title ?? data.headline),
      summary: CvParserBase.str(info.summary ?? data.summary ?? data.profile ?? data.objective),
      objective: CvParserBase.str(data.objective ?? data.career_objective ?? info.objective),
      experiences,
      education,
      skills: CvParserBase.arr(data.skills).map(pickSkill).filter(Boolean),
      languages: CvParserBase.arr(data.languages).map(pickLang).filter(Boolean),
      certifications: CvParserBase.arr(data.certifications ?? data.certificates).map(pickCert).filter(Boolean),
      preferredJobType: CvParserBase.str(data.preferences?.jobType ?? data.preferences?.preferredJobType ?? data.preferred_job_type),
      availability: CvParserBase.str(data.preferences?.availability ?? data.availability),
      expectedSalaryAoa: data.expected_salary_aoa ?? data.expectedSalaryAoa ?? data.preferences?.salaryExpectation,
    };
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Placeholder hooks for future ApyHub capabilities.
   * Un-comment and implement when you add enrichment/scoring features.
   * ──────────────────────────────────────────────────────────────────────── */

  // async enrichCandidate(profileData) {
  //   // POST https://api.apyhub.com/enrich/candidate
  // }

  // async scoreCandidate(profileData, jobDescription) {
  //   // POST https://api.apyhub.com/score/candidate
  // }
}
