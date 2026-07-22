/**
 * Central role -> portal-home mapping. Before this existed, four different
 * components each hand-rolled their own version of "where does this logged
 * in user belong" — CvBuilderCta and Header only checked "has a token"
 * (any role), so an admin clicking the CV-builder CTA got routed into the
 * candidate-only /Portal/Candidato/Construtor-CV, which then bounced them
 * to /Portal via useAuth's role guard. GoogleSignInButton and
 * PhoneLoginForm separately only special-cased "company", defaulting every
 * other role (including admin) to the candidate portal. One shared mapping
 * fixes the whole class of bug instead of patching each site differently.
 */
export function getPortalHomeForRole(role: string | undefined | null): string | null {
  switch (role) {
    case "candidate":
      return "/Portal/Candidato";
    case "company":
    case "recruiter":
      return "/Portal/Empresa";
    case "admin":
    case "super_admin":
    case "moderator":
      return "/Portal/Admin";
    default:
      return null;
  }
}

/** Where the "Construtor de CV" CTA should send a given (possibly logged
 * out) user — the CV builder itself only makes sense for candidates. */
export function getCvBuilderDestination(role: string | undefined | null): string {
  if (role === "candidate") return "/Portal/Candidato/Construtor-CV";
  const portalHome = getPortalHomeForRole(role);
  return portalHome ?? "/Submission#criar-cv";
}
