// Cookie-consent state — Wave X3, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md.
// cookies.md Section 2.2 promises analytics cookies are "apenas com o seu
// consentimento prévio" (only with prior consent) and Section 3 promises
// the choice — "incluindo a versão desta política em vigor no momento" —
// is recorded. This is the single source of truth both the consent
// banner and the analytics-script gate read from, so they can never
// disagree about what the user chose.

export type CookieConsentValue = {
  analytics: boolean;
  policyVersion: string | null;
  decidedAt: string;
};

const STORAGE_KEY = "parvagas_cookie_consent";

// Fired on every write so already-mounted components (the analytics
// script gate, any open banner in another tab via storage events) can
// react without a full page reload.
export const COOKIE_CONSENT_CHANGED_EVENT = "parvagas:cookie-consent-changed";
// Fired by "Gerir cookies" buttons (Definições pages) to reopen the
// banner for a registered user who wants to revisit their choice —
// cookies.md Section 3's "Nas Definições de Conta ... a qualquer momento".
export const COOKIE_CONSENT_REOPEN_EVENT = "parvagas:open-cookie-preferences";

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics !== "boolean") return null;
    return parsed as CookieConsentValue;
  } catch {
    return null;
  }
}

export function setCookieConsent(analytics: boolean, policyVersion: string | null): void {
  if (typeof window === "undefined") return;
  const value: CookieConsentValue = { analytics, policyVersion, decidedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: value }));
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent()?.analytics === true;
}

export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_CONSENT_REOPEN_EVENT));
}
