const configuredResumeBuilderUrl = String(process.env.NEXT_PUBLIC_RESUME_BUILDER_URL || "").trim();

const fallbackResumeBuilderUrl =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3050"
    : "https://cv.parvagas.pt";

export const RESUME_BUILDER_URL = configuredResumeBuilderUrl || fallbackResumeBuilderUrl;