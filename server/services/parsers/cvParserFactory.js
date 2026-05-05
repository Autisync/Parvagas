/**
 * cvParserFactory — selects the active CV parser based on the environment
 * variable `RESUME_PARSER_PROVIDER`.
 *
 * Supported values (case-insensitive):
 *   "skima"   — Skima AI resume parser (default)
 *   "apyhub"  — ApyHub Sharp API resume parser
 *   "manual"  — Regex/heuristic fallback (no external API call)
 *
 * Usage:
 *   import { getCvParser } from "../services/parsers/cvParserFactory.js";
 *   const parser = getCvParser();
 *   const { profile, provider, missingFields } =
 *     await parser.parseResume(file.buffer, file.originalname, file.mimetype);
 */

import { SkimaParser }         from "./SkimaParser.js";
import { ApyHubParser }        from "./ApyHubParser.js";
import { ManualFallbackParser } from "./ManualFallbackParser.js";
import { CvParserService } from "./CvParserService.js";
import { CvParserBase } from "./CvParserBase.js";

/** Cache one instance per process so we don't re-instantiate on every request. */
const _cache = {};

/**
 * @returns {import("./CvParserService.js").CvParserService}
 */
export function getCvParser() {
  const provider = (process.env.RESUME_PARSER_PROVIDER || "skima").trim().toLowerCase();

  if (_cache[provider]) return _cache[provider];

  switch (provider) {
    case "apyhub":
      _cache[provider] = new ApyHubParser();
      break;
    case "manual":
    case "fallback":
      _cache[provider] = new ManualFallbackParser();
      break;
    case "skima":
    default:
      _cache[provider] = new SkimaParser();
      break;
  }

  return _cache[provider];
}

/**
 * Convenience wrapper: parses a CV file using the active provider and falls
 * back to ManualFallbackParser if the primary provider throws, so upload
 * never hard-fails due to a third-party API outage.
 *
 * @param {{ buffer: Buffer, originalname: string, mimetype: string }} file
 * @returns {Promise<{ profile: object, provider: string, missingFields: string[], fallbackUsed: boolean }>}
 */
export async function parseCvFile(file) {
  const parser = getCvParser();

  try {
    const parsed = await parser.parse(file.buffer, file.originalname, file.mimetype);
    const profile = CvParserService.toProfileDraft(parsed);
    return {
      provider: parser.providerName(),
      parsed,
      profile,
      missingFields: CvParserBase.missingFields(profile),
      fallbackUsed: false,
    };
  } catch (primaryError) {
    const providerName = (process.env.RESUME_PARSER_PROVIDER || "skima").trim().toLowerCase();

    // Don't double-fallback if we are already using manual
    if (providerName === "manual" || providerName === "fallback") throw primaryError;

    console.error(`[cvParser] Primary provider "${providerName}" failed — falling back to manual parser.`, {
      error: primaryError.message,
      fileName: file.originalname,
    });

    const fallback = new ManualFallbackParser();
    const parsed = await fallback.parse(file.buffer, file.originalname, file.mimetype);
    const profile = CvParserService.toProfileDraft(parsed);
    return {
      provider: fallback.providerName(),
      parsed,
      profile,
      missingFields: CvParserBase.missingFields(profile),
      fallbackUsed: true,
    };
  }
}
