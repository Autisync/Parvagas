/**
 * Guards against click-to-execute XSS via a stored `javascript:` (or
 * `data:`, `vbscript:`, etc.) URL rendered as an <a href>. Scraped job
 * fields (sourceUrl, company website) are third-party content with no
 * scheme validation upstream, so this is the last line of defense at
 * render time — returns the URL unchanged when it's a genuine http(s)
 * link, otherwise null so the caller can omit the link entirely.
 */
export function safeExternalHref(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}
