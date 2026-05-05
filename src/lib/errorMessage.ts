export function normalizeErrorMessage(message: string): string {
  const raw = String(message || "").trim();
  if (!raw) return "";

  // Normalize common prefixed patterns like "Error: Error: ..."
  const withoutRepeatedPrefix = raw.replace(/^(?:error\s*:\s*)+/i, "").trim();

  // Collapse repeated whitespace and duplicated adjacent punctuation.
  const compact = withoutRepeatedPrefix
    .replace(/\s+/g, " ")
    .replace(/([.!?])\1+/g, "$1")
    .trim();

  // If a message was duplicated verbatim with a separator, keep one instance.
  const duplicatePattern = /^(.+?)\s*(?:\||-|\u2014|\.)\s*\1$/i;
  const duplicateMatch = compact.match(duplicatePattern);
  if (duplicateMatch?.[1]) {
    return duplicateMatch[1].trim();
  }

  return compact;
}
