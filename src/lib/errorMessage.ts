// Friendly, safe fallback shown whenever a raw error would otherwise leak
// internal details (env var names, URLs/ports, infra terms, stack traces).
const SAFE_FALLBACK = "Ocorreu um problema ao processar o pedido. Tente novamente dentro de momentos.";

// Patterns that indicate a message is developer-facing and must never reach a user.
const LEAK_PATTERNS: RegExp[] = [
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, // env-var style tokens: NEXT_PUBLIC_API_URL, DATABASE_URL, SENTRY_DSN
  /https?:\/\//i, // raw URLs
  /\blocalhost\b|\b127\.0\.0\.1\b|:\d{4,5}\b/i, // hosts / ports
  /\b(supabase|postgres|psycopg|sqlalchemy|alembic|docker|gunicorn|uvicorn|nginx|pooler|redis|celery)\b/i, // infra
  /\b(traceback|stack ?trace|exception|errno|econn|etimedout|enotfound)\b/i, // raw runtime errors
  /\b(cors|dsn|api[_ ]?key|secret\s*key|bearer|connection string|env(?:ironment)? var)/i, // secrets/config
  /(?:^|\s)\/(?:app|src|usr|home|var|etc)\//, // absolute file paths
];

function looksLikeLeak(message: string): boolean {
  return LEAK_PATTERNS.some((re) => re.test(message));
}

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
  const duplicatePattern = /^(.+?)\s*(?:\||-|—|\.)\s*\1$/i;
  const duplicateMatch = compact.match(duplicatePattern);
  const deduped = duplicateMatch?.[1] ? duplicateMatch[1].trim() : compact;

  // Safety net: never surface internal/architecture/secret detail to end users.
  if (looksLikeLeak(deduped)) {
    return SAFE_FALLBACK;
  }

  return deduped;
}
