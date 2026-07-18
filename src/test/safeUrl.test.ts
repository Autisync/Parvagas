import { describe, expect, it } from "vitest";
import { safeExternalHref } from "@/lib/safeUrl";

describe("safeExternalHref", () => {
  it("rejects javascript: URLs", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBe(null);
  });

  it("rejects data: URLs", () => {
    expect(safeExternalHref("data:text/html,<script>alert(1)</script>")).toBe(null);
  });

  it("rejects vbscript: URLs", () => {
    expect(safeExternalHref("vbscript:msgbox(1)")).toBe(null);
  });

  it("rejects malformed input", () => {
    expect(safeExternalHref("not a url")).toBe(null);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(safeExternalHref(null)).toBe(null);
    expect(safeExternalHref(undefined)).toBe(null);
    expect(safeExternalHref("")).toBe(null);
  });

  it("passes through http and https URLs unchanged", () => {
    expect(safeExternalHref("https://example.com/vaga/123")).toBe("https://example.com/vaga/123");
    expect(safeExternalHref("http://example.com")).toBe("http://example.com");
  });
});
