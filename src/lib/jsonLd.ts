/**
 * JSON.stringify escapes quotes but NOT `<` — a `</script>` inside any
 * string field (e.g. a scraped job's title/description) would otherwise
 * terminate the JSON-LD <script> block early and let an attacker start
 * their own <script> tag right after it (stored XSS). The Unicode LINE
 * SEPARATOR (code point 0x2028) and PARAGRAPH SEPARATOR (code point
 * 0x2029) are legal inside a JSON string but illegal as JavaScript line
 * terminators, so they are escaped too for the same reason.
 *
 * Both separators are located via String.fromCharCode() rather than a
 * regex/string literal containing the code point directly, so no raw
 * copy of either character exists anywhere in this file's source.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const LINE_SEPARATOR_ESCAPED = "\\" + "u2028";
const PARAGRAPH_SEPARATOR_ESCAPED = "\\" + "u2029";

export function toJsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .split("<").join("\\u003c")
    .split(LINE_SEPARATOR).join(LINE_SEPARATOR_ESCAPED)
    .split(PARAGRAPH_SEPARATOR).join(PARAGRAPH_SEPARATOR_ESCAPED);
}
