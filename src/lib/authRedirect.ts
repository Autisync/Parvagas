import { RESUME_BUILDER_URL } from "@/lib/resumeBuilder";

function defaultPortalRoute(role: string): string {
  if (role === "company") return "/Portal/Empresa/Perfil";
  return "/Portal/Candidato";
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolvePostLoginDestination(role: string, returnTo: string | null | undefined): string {
  const fallback = defaultPortalRoute(role);
  const target = (returnTo || "").trim();

  if (!target) return fallback;
  if (target.startsWith("/")) return target;
  if (typeof window === "undefined") return fallback;

  try {
    const parsed = new URL(target);
    const allowedOrigins = new Set<string>([window.location.origin]);
    const resumeBuilderOrigin = normalizeOrigin(RESUME_BUILDER_URL);

    if (resumeBuilderOrigin) allowedOrigins.add(resumeBuilderOrigin);
    if (!allowedOrigins.has(parsed.origin)) return fallback;

    return parsed.toString();
  } catch {
    return fallback;
  }
}