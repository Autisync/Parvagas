import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  getCookieConsent,
  hasAnalyticsConsent,
  setCookieConsent,
} from "@/lib/cookieConsent";

describe("cookieConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing has been decided yet", () => {
    expect(getCookieConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("persists an accept-all decision", () => {
    setCookieConsent(true, "2026-07");
    const stored = getCookieConsent();
    expect(stored?.analytics).toBe(true);
    expect(stored?.policyVersion).toBe("2026-07");
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("persists a reject-optional decision", () => {
    setCookieConsent(false, "2026-07");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("dispatches a change event on write", () => {
    const listener = vi.fn();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
    setCookieConsent(true, null);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
  });

  it("ignores malformed stored JSON", () => {
    localStorage.setItem("parvagas_cookie_consent", "not-json");
    expect(getCookieConsent()).toBeNull();
  });
});
