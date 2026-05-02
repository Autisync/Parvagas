export const JobStatuses = {
  DRAFT: "draft",
  PENDING_COMPANY_APPROVAL: "pending_company_approval",
  COMPANY_REJECTED: "company_rejected",
  PENDING_PLATFORM_REVIEW: "pending_platform_review",
  PLATFORM_REJECTED: "platform_rejected",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived",
  SUSPENDED: "suspended",
};

export const jobStatusValues = new Set(Object.values(JobStatuses));

const transitions = {
  [JobStatuses.DRAFT]: new Set([JobStatuses.PENDING_COMPANY_APPROVAL, JobStatuses.PUBLISHED, JobStatuses.ARCHIVED]),
  [JobStatuses.PENDING_COMPANY_APPROVAL]: new Set([
    JobStatuses.COMPANY_REJECTED,
    JobStatuses.APPROVED,
    JobStatuses.PUBLISHED,
    JobStatuses.PENDING_PLATFORM_REVIEW,
    JobStatuses.ARCHIVED,
  ]),
  [JobStatuses.COMPANY_REJECTED]: new Set([JobStatuses.PENDING_COMPANY_APPROVAL, JobStatuses.ARCHIVED]),
  [JobStatuses.PENDING_PLATFORM_REVIEW]: new Set([
    JobStatuses.PLATFORM_REJECTED,
    JobStatuses.APPROVED,
    JobStatuses.PUBLISHED,
    JobStatuses.SUSPENDED,
    JobStatuses.ARCHIVED,
  ]),
  [JobStatuses.PLATFORM_REJECTED]: new Set([JobStatuses.PENDING_PLATFORM_REVIEW, JobStatuses.ARCHIVED]),
  [JobStatuses.APPROVED]: new Set([JobStatuses.PUBLISHED, JobStatuses.ARCHIVED, JobStatuses.SUSPENDED]),
  [JobStatuses.PUBLISHED]: new Set([JobStatuses.SUSPENDED, JobStatuses.ARCHIVED, JobStatuses.PENDING_PLATFORM_REVIEW]),
  [JobStatuses.ARCHIVED]: new Set([JobStatuses.PENDING_PLATFORM_REVIEW, JobStatuses.PUBLISHED]),
  [JobStatuses.SUSPENDED]: new Set([JobStatuses.PENDING_PLATFORM_REVIEW, JobStatuses.ARCHIVED, JobStatuses.PUBLISHED]),
};

export const isValidJobStatus = (status) => jobStatusValues.has(String(status || "").trim());

export const canTransitionJobStatus = (fromStatus, toStatus) => {
  const from = String(fromStatus || "").trim();
  const to = String(toStatus || "").trim();
  if (!isValidJobStatus(to)) return false;
  if (!from) return true;
  if (from === to) return true;
  return transitions[from]?.has(to) || false;
};

export const isPlatformReviewRequired = (jobLike = {}, requestedEscalation = false) => {
  if (requestedEscalation) return true;
  if (jobLike.sourceType === "scraped") return true;

  const text = `${String(jobLike.title || "")} ${String(jobLike.description || "")}`.toLowerCase();
  const suspiciousSignals = ["crypto", "aposta", "casino", "betting", "piramide", "ponzi"];
  return suspiciousSignals.some((signal) => text.includes(signal));
};
