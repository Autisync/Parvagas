/** Shared autocomplete catalogs for skill/language/certification TagInputs.
 *
 * Single source for Meu-Perfil, CV-e-Documentos, and the CV builder editor —
 * these three surfaces previously kept their own private copies that had
 * already drifted from each other (different skill counts, "AWS" vs
 * "AWS Cloud Practitioner", etc.), so a candidate saw different suggestions
 * depending on which page they were on for the exact same field.
 */

export const SKILL_SUGGESTIONS = [
  "React", "Node.js", "TypeScript", "JavaScript", "UX", "Figma", "SQL",
  "Excel", "Power BI", "Atendimento ao cliente",
];

export const LANGUAGE_SUGGESTIONS = ["Português", "Inglês", "Francês", "Espanhol"];

export const CERT_SUGGESTIONS = [
  "Google UX", "AWS Cloud Practitioner", "Scrum Foundation", "Meta Front-End",
  "PMI", "Cisco CCNA",
];

/** Merge the catalog with the candidate's own already-typed values (session-
 * only, not persisted) — values they typed once should suggest again first. */
export function withOwnValues(catalog: string[], ownValues: string[]): string[] {
  const seen = new Set(catalog.map((v) => v.toLowerCase()));
  const extra = ownValues.filter((v) => v.trim() && !seen.has(v.trim().toLowerCase()));
  return [...extra, ...catalog];
}
