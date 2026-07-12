import { apiUrl, authFetch, getToken } from "@/lib/api";

const configuredResumeBuilderUrl = String(process.env.NEXT_PUBLIC_RESUME_BUILDER_URL || "").trim();

const fallbackResumeBuilderUrl =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3050"
    : "https://cv.parvagas.pt";

export const RESUME_BUILDER_URL = configuredResumeBuilderUrl || fallbackResumeBuilderUrl;

const RESUME_SSO_CLIENT_ID = String(process.env.NEXT_PUBLIC_RESUME_SSO_CLIENT_ID || "reactive-resume").trim();
const RESUME_SSO_REDIRECT_URI = String(process.env.NEXT_PUBLIC_RESUME_SSO_REDIRECT_URI || "").trim();

/**
 * Builds the URL that hands a logged-in candidate off to the CV builder
 * already authenticated as themselves, via Parvagas's own OIDC bridge
 * (backend-python/app/api/v1/resume_sso.py). Falls back to the plain
 * RESUME_BUILDER_URL — today's behavior — on any failure, so a logged-out
 * user or a backend hiccup never blocks reaching the tool, just the
 * auto-login convenience.
 */
export async function buildResumeBuilderSsoUrl(): Promise<string> {
  const token = getToken();
  if (!token || !RESUME_SSO_REDIRECT_URI) return RESUME_BUILDER_URL;

  try {
    const res = await authFetch<{ code: string }>("/resume-sso/handoff", token, { method: "POST" });
    const authorizeUrl = new URL(apiUrl("/oauth/authorize"));
    authorizeUrl.searchParams.set("client_id", RESUME_SSO_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", RESUME_SSO_REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "openid profile email");
    authorizeUrl.searchParams.set("handoff", res.code);
    return authorizeUrl.toString();
  } catch {
    return RESUME_BUILDER_URL;
  }
}