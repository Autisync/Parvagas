import { describe, expect, it } from "vitest";
import { toJsonLdString } from "@/lib/jsonLd";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const BACKSLASH = String.fromCharCode(0x5c);

describe("toJsonLdString", () => {
  it("never leaves a raw < character in the output", () => {
    const out = toJsonLdString({ description: "</script><script>alert(1)</script>" });
    expect(out.includes("<")).toBe(false);
  });

  it("never leaves a raw LINE SEPARATOR or PARAGRAPH SEPARATOR character in the output", () => {
    const out = toJsonLdString({ note: "a" + LINE_SEPARATOR + "b" + PARAGRAPH_SEPARATOR + "c" });
    expect(out.includes(LINE_SEPARATOR)).toBe(false);
    expect(out.includes(PARAGRAPH_SEPARATOR)).toBe(false);
  });

  it("escapes < using the six-character backslash-u-003c escape sequence", () => {
    const out = toJsonLdString({ title: "a<b" });
    expect(out.includes(BACKSLASH + "u003c")).toBe(true);
  });

  it("escapes the separators using backslash-u escape sequences", () => {
    const out = toJsonLdString({ note: "a" + LINE_SEPARATOR + "b" });
    expect(out.includes(BACKSLASH + "u2028")).toBe(true);
  });

  it("round-trips through JSON.parse back to the exact original value", () => {
    const evil = {
      title: "</script><script>alert(document.cookie)</script>",
      note: "line1" + LINE_SEPARATOR + "line2" + PARAGRAPH_SEPARATOR + "end",
      plain: "Engenheiro de Software",
    };
    const escaped = toJsonLdString(evil);
    // Reverse the same three substitutions the way a JSON parser would
    // (\u-escapes are standard JSON syntax, this isn't reimplementing the
    // function under test — it's simulating what JSON.parse does).
    const restored = escaped
      .split(BACKSLASH + "u003c").join("<")
      .split(BACKSLASH + "u2028").join(LINE_SEPARATOR)
      .split(BACKSLASH + "u2029").join(PARAGRAPH_SEPARATOR);
    expect(JSON.parse(restored)).toEqual(evil);
  });

  it("produces valid, parseable JSON for ordinary data with no special characters", () => {
    const data = { "@type": "JobPosting", title: "Contabilista", location: "Luanda" };
    expect(JSON.parse(toJsonLdString(data))).toEqual(data);
  });
});
