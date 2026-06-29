// reCAPTCHA Enterprise (score-based) token helper.
// The enterprise.js script is loaded in app/layout.tsx, gated by
// NEXT_PUBLIC_RECAPTCHA_SITE_KEY. When the key is absent, getRecaptchaToken
// resolves to null and the backend treats captcha as not-enforced.

export const RECAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6Lf4CistAAAAAIq1r40uoJLlTspXn_05-0pz9zJc";

type Grecaptcha = {
  enterprise: {
    ready: (cb: () => void) => void;
    execute: (siteKey: string, opts: { action: string }) => Promise<string>;
  };
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

function ready(): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (typeof window !== "undefined" && window.grecaptcha?.enterprise?.execute) {
        window.grecaptcha.enterprise.ready(() => resolve());
      } else if (Date.now() - start > 8000) {
        resolve(); // give up; caller proceeds without a token
      } else {
        setTimeout(tick, 150);
      }
    };
    tick();
  });
}

/**
 * Get a reCAPTCHA Enterprise token for the given action (e.g. "login",
 * "register", "apply"). Returns null if the script never loaded / no site key,
 * so callers can still submit (backend decides whether captcha is enforced).
 */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    await ready();
    if (!window.grecaptcha?.enterprise?.execute) return null;
    return await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
  } catch {
    return null;
  }
}
