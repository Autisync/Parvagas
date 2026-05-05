/**
 * ManualFallbackParser — local heuristic CV parser that runs entirely
 * in-process without any external API call.
 *
 * This is the last-resort fallback when all configured API providers fail.
 * It uses the existing cvTextExtractorService to pull plain text from the
 * file, then applies regex heuristics.  Quality is intentionally limited —
 * users should be prompted to review the results.
 */

import { CvParserBase } from "./CvParserBase.js";
import { CvParserService } from "./CvParserService.js";
import { extractCvText } from "../cvTextExtractorService.js";

const emailRe = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
const phoneRe = /\+?\d[\d\s()\-]{7,20}/g;

/** Headings that typically precede a skills list. */
const SKILLS_HEADING = /skills|compet[êe]ncias|tecnologias|technical|soft skills/i;
/** Headings that typically precede an experience block. */
const EXP_HEADING    = /experience|experi[êe]ncia|work history|emprego|career|hist[oó]rico/i;
/** Headings that typically precede an education block. */
const EDU_HEADING    = /education|educa[çc][aã]o|forma[çc][aã]o|academic|qualif/i;
/** Headings for language section. */
const LANG_HEADING   = /languages?|idiomas?/i;
/** Headings for certifications. */
const CERT_HEADING   = /certif|licen[çc]as?|cursos?|courses?/i;

export class ManualFallbackParser extends CvParserService {
  /**
   * @param {Buffer}  buffer
   * @param {string}  fileName
   * @param {string}  mimeType
   */
  providerName() {
    return "manual";
  }

  async parse(buffer, fileName, mimeType) {
    // extractCvText expects a multer-like file object
    const text = await extractCvText({ buffer, originalname: fileName, mimetype: mimeType });
    return this._parse(text);
  }

  _parse(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const name = lines[0] || "";
    const title = lines[1] || "";

    const allText = lines.join(" ");
    const email = (allText.match(emailRe) || [])[0] || "";
    const phone = (allText.match(phoneRe) || [])[0] || "";

    // Collect skills from lines directly beneath the skills heading
    const skills = this._extractListAfterHeading(lines, SKILLS_HEADING);

    // Collect languages
    const languages = this._extractListAfterHeading(lines, LANG_HEADING);

    // Collect certifications
    const certifications = this._extractListAfterHeading(lines, CERT_HEADING, 6);

    // Build a rudimentary summary from the first few non-heading lines
    const summary = lines
      .filter((l) => l.length > 40 && !SKILLS_HEADING.test(l) && !EXP_HEADING.test(l) && !EDU_HEADING.test(l))
      .slice(0, 4)
      .join(" ")
      .slice(0, 500);

    return {
      ...CvParserService.emptyParsed(),
      name,
      email: email.toLowerCase(),
      phone,
      location: "",
      title,
      summary,
      experiences: [],  // Heuristic experience parsing is unreliable — leave for user to fill
      education: [],    // Same
      skills,
      languages,
      certifications,
    };
  }

  /**
   * Returns up to `limit` non-empty tokens from lines that appear after
   * the first line matching `heading`.  Stops at the next heading-like line.
   */
  _extractListAfterHeading(lines, heading, limit = 20) {
    const idx = lines.findIndex((l) => heading.test(l));
    if (idx === -1) return [];

    const sectionLines = [];
    for (let i = idx + 1; i < lines.length && sectionLines.length < limit; i++) {
      const l = lines[i];
      // Stop if we hit another section heading (all-caps line or known heading keyword)
      if (/^[A-Z\s]{4,}$/.test(l) || SKILLS_HEADING.test(l) || EXP_HEADING.test(l) || EDU_HEADING.test(l) || LANG_HEADING.test(l) || CERT_HEADING.test(l)) break;
      sectionLines.push(l);
    }

    return sectionLines
      .flatMap((l) => l.split(/[,;|•·\-–—]/))
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 60);
  }
}
