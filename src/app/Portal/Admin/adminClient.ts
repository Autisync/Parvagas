"use client";

import { authFetch, authFetchRaw } from "@/lib/api";

export type AdminLevel = "super-admin" | "moderator";

export type AdminMe = {
  id: string;
  role: string;
  adminLevel: AdminLevel;
  permissions?: string[];
};

export const AdminPermissions = {
  JOB_REVIEW: "job.review",
  JOB_APPROVE: "job.approve",
  JOB_REJECT: "job.reject",
  AD_FLAG: "ad.flag",
  AD_PAUSE: "ad.pause",
  AD_DRAFT: "ad.draft",
  AD_PUBLISH: "ad.publish",
  DASHBOARD_VIEW: "admin.dashboard.view",
  ANALYTICS_VIEW: "admin.analytics.view",
  JOBS_MODERATE: "admin.jobs.moderate",
  SCRAPED_CREATE: "admin.scrapedJobs.create",
  SCRAPED_EDIT: "admin.scrapedJobs.edit",
  SCRAPED_REVIEW: "admin.scrapedJobs.review",
  COMPANIES_VERIFY: "admin.companies.verify",
  COMPANIES_REJECT: "admin.companies.reject",
  COMPANIES_SUSPEND: "admin.companies.suspend",
  USERS_SUSPEND: "admin.users.suspend",
  USERS_REACTIVATE: "admin.users.reactivate",
  ADMINS_PROMOTE: "admin.admins.promote",
  ADMINS_DEMOTE: "admin.admins.demote",
  AUDIT_LOGS_VIEW: "admin.auditLogs.view",
  ADMIN_ACTIONS_VIEW: "admin.adminActionLogs.view",
  ADS_CREATE: "admin.ads.create",
  ADS_MANAGE: "admin.ads.manage",
  EXPORT_USERS: "admin.exports.users",
  EXPORT_JOBS: "admin.exports.jobs",
  EXPORT_COMPANIES: "admin.exports.companies",
  SCRAPER_SOURCES_MANAGE: "admin.scraperSources.manage",
  SUBSCRIPTIONS_MANAGE: "admin.subscriptions.manage",
  FEATURE_FLAGS_MANAGE: "admin.featureFlags.manage",
} as const;

export function hasPermission(me: AdminMe | null | undefined, permission: string) {
  return Array.isArray(me?.permissions) && me?.permissions.includes(permission);
}

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Paginated<T extends string, R> = Record<T, R[]> & {
  pagination?: Pagination;
};

export type Overview = {
  // null when the backend could not read the metric (vs. a real 0). `ok: false`
  // signals the whole block failed to load so the UI can show an error, not 0.
  users: number | null;
  companies: number | null;
  jobs: number | null;
  scraped: number | null;
  ads: number | null;
  ok?: boolean;
  activeGuestAccounts?: number;
  convertedGuestAccounts?: number;
  guestConversionRate?: number | null;
};

export type AnalyticsResponse = {
  range: { from: string | null; to: string | null };
  totals: Overview & { applications: number | null };
  operational: {
    pendingJobs: number | null;
    pendingCompanies: number | null;
    suspendedUsers: number | null;
    pendingScraped: number | null;
    activeApplications: number | null;
    ok?: boolean;
  };
  trends: {
    usersPct: number;
    companiesPct: number;
    jobsPct: number;
    applicationsPct: number;
    revenuePct: number | null;
  };
  series: {
    jobsPosted: Array<{ label: string; value: number }>;
    userSignups: Array<{ label: string; value: number }>;
    applications: Array<{ label: string; value: number }>;
    revenue: Array<{ label: string; value: number }>;
  };
  distributions: {
    applicationStatus: Array<{ label: string; value: number }>;
    jobsByStatus: Array<{ label: string; value: number }>;
    companyVerification: Array<{ label: string; value: number }>;
    jobLocationDensity: Array<{ label: string; value: number }>;
    userLocationDensity: Array<{ label: string; value: number }>;
  };
  business: {
    revenueInRange: number | null;
    adCountInRange: number | null;
  };
  insights?: {
    anomalies: Array<{
      metric: string;
      severity: "medium" | "high";
      direction: "up" | "down";
      changePct: number;
      latest: number;
      baseline: number;
    }>;
    forecasts: {
      jobsPostedNext: number;
      userSignupsNext: number;
      applicationsNext: number;
      revenueNext: number | null;
    };
  };
  cache?: { hit: boolean; ttlMs: number };
};

export type UserRecord = {
  _id: string;
  fullName?: string;
  email?: string;
  role?: string;
  adminLevel?: AdminLevel;
  suspended?: boolean;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  isGuestAccount?: boolean;
  createdAt?: string;
};

export type JobRecord = {
  _id: string;
  title?: string;
  status?: string;
  visibility?: string;
  featured?: boolean;
  location?: string;
  category?: string;
  workMode?: string;
  contractType?: string;
  jobType?: string;
  salaryRange?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  experienceLevel?: string;
  description?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  createdAt?: string;
  companyId?: { _id?: string; name?: string } | string;
};

export type ApplicationRecord = {
  _id: string;
  status?: string;
  createdAt?: string;
  companyId?: string;
  candidateUserId?: string;
  jobId?: string;
};

export type CompanyRecord = {
  _id: string;
  name?: string;
  nif?: string;
  companyIdentifier?: string;
  industry?: string;
  size?: string;
  location?: string;
  status?: "inactive" | "pending_verification" | "active" | "rejected";
  verificationStatus?: string;
  contactEmail?: string;
  contactPerson?: string;
  createdAt?: string;
};

export type ScrapedRecord = {
  _id: string;
  title?: string;
  company?: string;
  location?: string;
  source?: string;
  sourceUrl?: string;
  status?: string;
  duplicateOf?: string | null;
  applicationDeadline?: string | null;
  scheduledPublishAt?: string | null;
  audienceLane?: string | null;
  qualityScore?: number;
  qualityFlags?: string[];
  description?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  companyLogoUrl?: string | null;
  companyWebsite?: string | null;
  contactEmail?: string | null;
  createdAt?: string;
};

export type AdCampaignRecord = {
  _id: string;
  title?: string;
  placement?: string;
  link?: string;
  imageUrl?: string;
  status?: string;
  active?: boolean;
  flagged?: boolean;
  budget?: number;
  costPerClick?: number;
  costPerImpression?: number;
  spent?: number;
  budgetRemaining?: number | null;
  targetCategory?: string | null;
  targetLocation?: string | null;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
};

export type CareerPostRecord = {
  _id: string;
  slug: string;
  title: string;
  category?: string | null;
  excerpt?: string | null;
  readTime?: string | null;
  author?: string | null;
  coverImage?: string | null;
  body: string[];
  takeaways: string[];
  featuredOnHome: boolean;
  published: boolean;
  publishedAt?: string | null;
  createdAt?: string | null;
};

export type AuditLogRecord = {
  _id: string;
  actorUserId?: string | null;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
};

export type AdminActionRecord = {
  _id: string;
  adminUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

export type SecurityEventRecord = {
  _id: string;
  eventType: string;
  severity: "low" | "medium" | "high";
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  createdAt?: string;
};

export type SecuritySummary = {
  last24hTotal: number | null;
  last24hHigh: number | null;
  last24hFailedLogins: number | null;
};

export type ClientErrorLogRecord = {
  _id: string;
  level: "warning" | "error" | "critical";
  message: string;
  path?: string | null;
  details?: string | null;
  createdAt?: string | null;
};

export type LaunchReadinessCheck = {
  id: string;
  scope: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type LaunchReadinessResponse = {
  generatedAt: string;
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
  };
  checks: LaunchReadinessCheck[];
};

export type CvBuilderReadinessCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type CvBuilderReadinessResponse = {
  ready: boolean;
  summary: { pass: number; warn: number; fail: number; total: number };
  checks: CvBuilderReadinessCheck[];
  message: string;
};

// Scraper types the admin board can select — kept in sync with the backend's
// VALID_SCRAPER_SOURCE_TYPES (careerjet is intentionally excluded there).
export const SCRAPER_SOURCE_TYPES = ["json", "rss", "greenhouse", "lever", "jobartis", "airswift"] as const;
export type ScraperSourceType = (typeof SCRAPER_SOURCE_TYPES)[number];

export type ScraperSourceRecord = {
  _id: string;
  name: string;
  type: string;
  url: string;
  category?: string | null;
  enabled: boolean;
  maxResults?: number | null;
  trustedAutoApprove?: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  lastRunDetail?: string | null;
  lastRunJobCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ScraperSettingsRecord = {
  enabled: boolean;
  defaultTimeoutSeconds: number;
  defaultMaxPerSource: number;
  userAgent?: string | null;
  maxIngestPerRun: number;
  runBudgetSeconds: number;
  updatedAt?: string | null;
};

export function listQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value).trim() && String(value) !== "all") {
      qs.set(key, String(value));
    }
  });
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export function dateRangeQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchAdminMe(token: string) {
  return authFetch<AdminMe>("/admin/me", token);
}

export async function fetchOverview(token: string) {
  return authFetch<Overview>("/admin/overview", token);
}

export async function fetchAnalytics(token: string, from?: string, to?: string) {
  return authFetch<AnalyticsResponse>(`/admin/analytics${dateRangeQuery(from, to)}`, token);
}

export async function fetchUsers(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"users", UserRecord>>(`/admin/users${listQuery(params)}`, token);
}

export type VerificationBackfillResult = {
  totalUnverified: number;
  sent: number;
  skippedCooldown: number;
  dryRun: boolean;
};

export async function runVerificationBackfill(token: string, dryRun: boolean) {
  return authFetch<VerificationBackfillResult>("/admin/users/verification-backfill", token, {
    method: "POST",
    body: JSON.stringify({ dryRun }),
  });
}

export async function resendUserVerification(token: string, userId: string) {
  return authFetch<{ sent: boolean; userId: string }>(`/admin/users/${userId}/resend-verification`, token, {
    method: "POST",
    suppressGlobalErrors: true,
  });
}

export async function fetchJobs(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"jobs", JobRecord>>(`/admin/jobs${listQuery(params)}`, token);
}

export async function setJobFeatured(token: string, jobId: string, featured: boolean) {
  return authFetch<{ job: JobRecord }>(`/admin/jobs/${jobId}/featured`, token, {
    method: "PATCH",
    body: JSON.stringify({ featured }),
    suppressGlobalErrors: true,
  });
}

export async function fetchApplications(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"applications", ApplicationRecord>>(`/admin/applications${listQuery(params)}`, token);
}

export async function fetchCompanies(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"companies", CompanyRecord>>(`/admin/companies${listQuery(params)}`, token);
}

export type AtsStageSummary = {
  stages: Array<{ name: string; count: number }>;
  totalPipelineItems: number;
  companiesWithPipeline: number;
};

export async function fetchAtsStageSummary(token: string) {
  return authFetch<AtsStageSummary>(`/admin/companies/ats-stage-summary`, token, { suppressGlobalErrors: true });
}

export type TaskRunStatus = "never_run" | "running" | "success" | "failed";

export type TaskRunSummary = {
  taskName: string;
  lastRun: {
    startedAt: string | null;
    finishedAt: string | null;
    status: TaskRunStatus;
    detail: string | null;
  };
};

export async function fetchTaskRuns(token: string) {
  return authFetch<{ tasks: TaskRunSummary[] }>(`/admin/task-runs`, token, { suppressGlobalErrors: true });
}

export type CompanyTeamSummary = {
  owner: { id: string; fullName?: string; email?: string } | null;
  members: Array<{ id: string; userId: string; fullName?: string; email?: string; role: string; joinedAt?: string | null }>;
  pendingInvites: Array<{ id: string; email: string; role: string; expiresAt?: string | null; createdAt?: string | null }>;
  memberCount: number;
};

export async function fetchCompanyTeam(token: string, companyId: string) {
  return authFetch<CompanyTeamSummary>(`/admin/companies/${companyId}/team`, token, { suppressGlobalErrors: true });
}

export async function fetchScraped(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"scrapedJobs", ScrapedRecord> & { laneCounts?: Record<string, number> }>(
    `/admin/scraped-jobs${listQuery(params)}`, token,
  );
}

export const AUDIENCE_LANE_LABELS: Record<string, string> = {
  entry_level: "Sem experiência",
  skilled_trade: "Ofício qualificado",
  professional: "Profissional",
  remote: "Remoto",
  unclassified: "Não classificado",
};

export async function fetchAuditLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"auditLogs", AuditLogRecord>>(`/admin/audit-logs${listQuery(params)}`, token);
}

export async function fetchSecurityEvents(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"securityEvents", SecurityEventRecord> & { summary?: SecuritySummary }>(
    `/admin/security/events${listQuery(params)}`,
    token,
  );
}

export async function fetchClientErrors(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"errors", ClientErrorLogRecord> & { dailySeries?: Array<{ label: string; value: number }> }>(
    `/admin/analytics/client-errors${listQuery(params)}`,
    token,
  );
}

export type BusinessFunnelsAnalytics = {
  signupFunnel: {
    signups: number;
    verified: number;
    appliedAtLeastOnce: number;
    verifiedRate: number | null;
    appliedRate: number | null;
  };
  moderationSla: { avgHours: number | null; medianHours: number | null; sampleSize: number };
  cvParsing: { completed: number; failed: number; failureRate: number | null };
  newsletter: {
    weeklySignups: Array<{ label: string; value: number }>;
    totalSubscribers: number;
    activeSubscribers: number;
  };
  spamScoreDistribution: Array<{ label: string; value: number }>;
};

export async function fetchBusinessFunnelsAnalytics(token: string) {
  return authFetch<BusinessFunnelsAnalytics>("/admin/analytics/funnels", token);
}

export async function downloadAuditLogsCsv(token: string, params: Record<string, string | number | undefined> = {}) {
  const query = listQuery(params);
  return downloadCsv(`/admin/audit-logs/export.csv${query}`, token, "parvagas-audit-logs.csv");
}

export async function fetchAdminActions(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"adminActions", AdminActionRecord>>(`/admin/admin-actions${listQuery(params)}`, token);
}

export type SupportMessageRecord = {
  _id: string;
  senderName?: string | null;
  senderEmail?: string | null;
  senderRole?: string | null;
  recipientName?: string | null;
  reason?: string | null;
  message: string;
  status: "open" | "resolved";
  createdAt?: string | null;
};

export async function fetchSupportMessages(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"supportMessages", SupportMessageRecord>>(`/admin/support-messages${listQuery(params)}`, token);
}

export async function resolveSupportMessage(token: string, id: string) {
  return authFetch<SupportMessageRecord>(`/admin/support-messages/${id}/resolve`, token, {
    method: "PATCH",
    suppressGlobalErrors: true,
  });
}

export async function forceLogoutUser(token: string, userId: string) {
  return authFetch<{ user: UserRecord }>(`/admin/users/${userId}/force-logout`, token, {
    method: "POST",
    suppressGlobalErrors: true,
  });
}

export type ResumeTemplateRecord = {
  _id: string;
  name: string;
  slug: string;
  description?: string | null;
  previewUrl?: string | null;
  isActive: boolean;
};

export async function fetchAdminResumeTemplates(token: string) {
  return authFetch<{ resumeTemplates: ResumeTemplateRecord[]; availableSlugs: string[] }>(
    `/admin/resume-templates`,
    token,
  );
}

export async function createAdminResumeTemplate(
  token: string,
  payload: { slug: string; name: string; description?: string; previewUrl?: string; isActive?: boolean },
) {
  return authFetch<ResumeTemplateRecord>(`/admin/resume-templates`, token, {
    method: "POST",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function updateAdminResumeTemplate(
  token: string,
  id: string,
  payload: { name?: string; description?: string; previewUrl?: string; isActive?: boolean },
) {
  return authFetch<ResumeTemplateRecord>(`/admin/resume-templates/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function fetchLaunchReadiness(token: string, checkServices = false) {
  return authFetch<LaunchReadinessResponse>(`/admin/launch-readiness${listQuery({ checkServices: checkServices ? "true" : undefined })}`, token);
}

export async function fetchCvBuilderReadiness(token: string) {
  return authFetch<CvBuilderReadinessResponse>("/admin/cv-builder/readiness", token);
}

// ── Scraper Config — admin-managed sources + global tuning ────────────────

export async function fetchScraperSources(token: string) {
  return authFetch<{ scraperSources: ScraperSourceRecord[] }>("/admin/scraper-sources", token);
}

export async function createScraperSource(token: string, payload: Partial<ScraperSourceRecord>) {
  return authFetch<ScraperSourceRecord>("/admin/scraper-sources", token, {
    method: "POST",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function updateScraperSource(token: string, id: string, payload: Partial<ScraperSourceRecord>) {
  return authFetch<ScraperSourceRecord>(`/admin/scraper-sources/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function deleteScraperSource(token: string, id: string) {
  return authFetch<{ deleted: boolean; id: string }>(`/admin/scraper-sources/${id}`, token, {
    method: "DELETE",
  });
}

export type FeatureFlagRecord = {
  key: string;
  value: boolean;
  description?: string | null;
  updatedAt?: string | null;
};

export async function fetchFeatureFlags(token: string) {
  return authFetch<{ featureFlags: FeatureFlagRecord[] }>("/admin/feature-flags", token);
}

export async function updateFeatureFlag(token: string, key: string, value: boolean) {
  return authFetch<FeatureFlagRecord>(`/admin/feature-flags/${key}`, token, {
    method: "PATCH",
    body: JSON.stringify({ value }),
    suppressGlobalErrors: true,
  });
}

export async function fetchScraperSettings(token: string) {
  return authFetch<ScraperSettingsRecord>("/admin/scraper-settings", token);
}

export async function updateScraperSettings(token: string, payload: Partial<ScraperSettingsRecord>) {
  return authFetch<ScraperSettingsRecord>("/admin/scraper-settings", token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

// ── Deploy panel ──────────────────────────────────────────────────────────

export type DeployCommit = { hash: string; message: string };
export type DeployDiff = {
  branch: string;
  commits: DeployCommit[];
  commits_ahead: number;
  diff_stat: string;
  last_commit: { hash: string; message: string; author: string; when: string };
  dirty_files: string[];
  ready_to_deploy: boolean;
  error?: string;
};
export type DeployResult = {
  success: boolean;
  detail: string;
  deployed_at: string;
  deployed_by: string;
};
export type DeployHistoryItem = {
  id: string;
  action: string;
  actor: string;
  details: { reason?: string; result?: string; error?: string };
  created_at: string;
};

export async function fetchDeployDiff(token: string) {
  return authFetch<DeployDiff>("/admin/deploy/diff", token);
}

export async function triggerDeploy(token: string, reason: string) {
  return authFetch<DeployResult>("/admin/deploy/push", token, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function fetchDeployHistory(token: string) {
  return authFetch<{ history: DeployHistoryItem[] }>("/admin/deploy/history", token);
}

export function statusBadgeClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "super-admin") return "bg-red-100 text-red-800 border-red-200";
  if (s === "moderator") return "bg-sky-100 text-sky-800 border-sky-200";
  if (["approved", "verified", "published", "active"].includes(s)) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "scheduled") return "bg-indigo-100 text-indigo-800 border-indigo-200";
  if (["rejected", "archived", "suspended"].includes(s)) return "bg-rose-100 text-rose-800 border-rose-200";
  if (["pending", "submitted", "under_review", "pending_company_approval", "pending_platform_review", "needs_more_info", "pending_verification"].includes(s)) {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function toDateLabel(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function downloadCsv(path: string, token: string, fileName: string) {
  const res = await authFetchRaw(path, token);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as Record<string, string>).error || `HTTP ${res.status}`;
    throw new Error(message);
  }

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

export async function fetchAdminAds(token: string) {
  return authFetch<{ ads: AdCampaignRecord[] }>("/admin/ads", token);
}

export async function uploadAdminAdImage(token: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return authFetch<{ imageUrl: string; previewUrl: string | null }>("/admin/ads/upload-image", token, {
    method: "POST",
    body: form,
    suppressGlobalErrors: true,
  });
}

export async function createAdminAd(token: string, payload: Partial<AdCampaignRecord>) {
  return authFetch<{ ad: AdCampaignRecord }>("/admin/ads", token, {
    method: "POST",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function updateAdminAd(token: string, id: string, payload: Partial<AdCampaignRecord>) {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function replaceAdminAd(token: string, id: string, payload: Partial<AdCampaignRecord>) {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function setAdminAdStatus(token: string, id: string, active: boolean) {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ active }),
    suppressGlobalErrors: true,
  });
}

export async function pauseAdminAd(token: string, id: string, reason = "") {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}/pause`, token, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
    suppressGlobalErrors: true,
  });
}

export async function flagAdminAd(token: string, id: string, reason: string) {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}/flag`, token, {
    method: "POST",
    body: JSON.stringify({ reason }),
    suppressGlobalErrors: true,
  });
}

export async function unflagAdminAd(token: string, id: string) {
  return authFetch<{ ad: AdCampaignRecord }>(`/admin/ads/${id}/unflag`, token, {
    method: "POST",
    suppressGlobalErrors: true,
  });
}

export async function deleteAdminAd(token: string, id: string) {
  return authFetch<{ deleted: boolean }>(`/admin/ads/${id}`, token, {
    method: "DELETE",
    suppressGlobalErrors: true,
  });
}

export async function fetchAdminCareerPosts(token: string) {
  return authFetch<{ posts: CareerPostRecord[] }>("/admin/career-posts", token);
}

export async function createAdminCareerPost(token: string, payload: Partial<CareerPostRecord>) {
  return authFetch<{ post: CareerPostRecord }>("/admin/career-posts", token, {
    method: "POST",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function updateAdminCareerPost(token: string, id: string, payload: Partial<CareerPostRecord>) {
  return authFetch<{ post: CareerPostRecord }>(`/admin/career-posts/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function deleteAdminCareerPost(token: string, id: string) {
  return authFetch<{ deleted: boolean }>(`/admin/career-posts/${id}`, token, {
    method: "DELETE",
    suppressGlobalErrors: true,
  });
}

export async function updateScrapedJob(token: string, id: string, payload: Partial<ScrapedRecord>) {
  return authFetch<{ scraped: ScrapedRecord }>(`/admin/scraped-jobs/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteScrapedJob(token: string, id: string) {
  return authFetch<{ deleted: boolean }>(`/admin/scraped-jobs/${id}`, token, {
    method: "DELETE",
  });
}

export async function runAdminScraper(token: string) {
  return authFetch<{ queued: boolean; sources: string[]; message: string }>("/admin/scraped-jobs/run", token, {
    method: "POST",
    suppressGlobalErrors: true,
  });
}

// ── Subscriptions & Plans ───────────────────────────────────────────────────
// General "offers" catalogue (company plans + candidate CV Builder plans)
// plus per-user subscription management surfaced under the Users tab.

export type PlanRecord = {
  _id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  interval: "month" | "one_time";
  features: string[];
  active: boolean;
};

export type CandidateCvPlanRecord = {
  _id: string;
  tier: string;
  name: string;
  price: number;
  currency: string;
  interval: "month" | "one_time";
  features: string[];
  maxResumes: number;
  aiScore: boolean;
  aiRewrite: boolean;
  coverLetters: boolean;
  autoApply: boolean;
  active: boolean;
};

// The candidate side's "availablePlans" shape differs from PlanRecord (it
// mirrors the old CV_BUILDER_PLANS dict shape — snake_case limits — not the
// DB row shape) — kept distinct rather than forced into PlanRecord's fields.
export type CvPlanOffer = {
  tier: string;
  name: string;
  price: number;
  interval: "month" | "one_time";
  features: string[];
  limits: {
    max_resumes: number;
    ai_score: boolean;
    ai_rewrite: boolean;
    cover_letters: boolean;
    auto_apply: boolean;
  };
};

export type TransactionRecord = {
  _id: string;
  companyId?: string | null;
  planId?: string | null;
  amount: number;
  currency: string;
  provider: string;
  reference?: string | null;
  status: string;
  kind: string;
  partyType: "company" | "candidate" | "unknown";
  partyName?: string | null;
  createdAt?: string | null;
  receiptNumber?: string | null;
  refundedAt?: string | null;
  refundReference?: string | null;
};

export type UserSubscriptionSummary = {
  scope: "company" | "candidate" | null;
  subscription: {
    _id?: string;
    status?: string;
    planCode?: string | null;
    planName?: string | null;
    tier?: string;
    currentPeriodEnd?: string | null;
  } | null;
  transactions: TransactionRecord[];
  availablePlans: PlanRecord[] | CvPlanOffer[];
};

export type ExpiringSubscription = {
  scope: "company" | "candidate";
  userId: string | null;
  name: string | null;
  planName: string | null;
  currentPeriodEnd: string | null;
};

export async function fetchExpiringSubscriptions(token: string, daysAhead = 7) {
  return authFetch<{ expiring: ExpiringSubscription[]; daysAhead: number }>(
    `/admin/subscriptions/expiring${listQuery({ daysAhead })}`, token,
  );
}

export async function fetchAdminPlans(token: string) {
  return authFetch<{ plans: PlanRecord[] }>("/admin/plans", token);
}

export async function createAdminPlan(token: string, payload: Partial<PlanRecord>) {
  return authFetch<PlanRecord>("/admin/plans", token, {
    method: "POST",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function updateAdminPlan(token: string, id: string, payload: Partial<PlanRecord>) {
  return authFetch<PlanRecord>(`/admin/plans/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function deleteAdminPlan(token: string, id: string) {
  return authFetch<{ deleted: boolean; id: string }>(`/admin/plans/${id}`, token, {
    method: "DELETE",
    suppressGlobalErrors: true,
  });
}

export async function fetchAdminCandidateCvPlans(token: string) {
  return authFetch<{ candidateCvPlans: CandidateCvPlanRecord[] }>("/admin/candidate-cv-plans", token);
}

export async function updateAdminCandidateCvPlan(token: string, id: string, payload: Partial<CandidateCvPlanRecord>) {
  return authFetch<CandidateCvPlanRecord>(`/admin/candidate-cv-plans/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

export async function fetchAdminTransactions(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"transactions", TransactionRecord>>(`/admin/transactions${listQuery(params)}`, token);
}

export async function rejectAdminTransaction(token: string, id: string, status: "failed" | "cancelled") {
  return authFetch<TransactionRecord>(`/admin/transactions/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    suppressGlobalErrors: true,
  });
}

export async function refundAdminTransaction(token: string, id: string, refundReference?: string) {
  return authFetch<TransactionRecord>(`/admin/transactions/${id}/refund`, token, {
    method: "POST",
    body: JSON.stringify({ refundReference }),
    suppressGlobalErrors: true,
  });
}

export async function downloadAdminTransactionReceipt(token: string, id: string, receiptNumber: string) {
  const res = await authFetchRaw(`/admin/transactions/${id}/receipt`, token, { suppressGlobalErrors: true });
  if (!res.ok) throw new Error("Não foi possível obter o recibo.");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `recibo-${receiptNumber}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

export async function fetchUserSubscription(token: string, userId: string) {
  return authFetch<UserSubscriptionSummary>(`/admin/users/${userId}/subscription`, token);
}

export async function updateUserSubscription(
  token: string,
  userId: string,
  payload: { planCode?: string; tier?: string; status?: string; currentPeriodEnd?: string },
) {
  return authFetch<UserSubscriptionSummary>(`/admin/users/${userId}/subscription`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
    suppressGlobalErrors: true,
  });
}

// Reuses the existing candidate/company payment-confirm endpoints (already
// admin-gated) rather than duplicating that logic under /admin.
export async function confirmCompanyPayment(token: string, reference: string) {
  return authFetch<{ transaction: { _id: string; reference: string; status: string }; activated: boolean }>(
    `/payments/${reference}/confirm`, token, { method: "POST", suppressGlobalErrors: true },
  );
}

export async function confirmCandidateCvPayment(token: string, reference: string) {
  return authFetch<{ activated: boolean; tier: string; reference: string }>(
    `/cv-builder/confirm/${reference}`, token, { method: "POST", suppressGlobalErrors: true },
  );
}

// ── Legal documents (Wave L3) ───────────────────────────────────────────

export type LegalDocumentAudience = "public" | "employer" | "internal";

export type LegalDocumentVersionRecord = {
  _id: string;
  documentId: string;
  versionLabel: string;
  bodyMarkdown: string;
  status: "draft" | "published" | "archived";
  effectiveDate: string | null;
  publishedAt: string | null;
  createdAt: string | null;
};

export type LegalDocumentRecord = {
  _id: string;
  slug: string;
  title: string;
  category: string;
  audience: LegalDocumentAudience;
  requiresAcceptance: boolean;
  versionCount: number;
  currentVersion: LegalDocumentVersionRecord | null;
};

export type LegalDocumentDetail = LegalDocumentRecord & { versions: LegalDocumentVersionRecord[] };

export async function fetchAdminLegalDocuments(token: string, audience?: LegalDocumentAudience) {
  const qs = audience ? `?audience=${audience}` : "";
  return authFetch<{ legalDocuments: LegalDocumentRecord[] }>(`/admin/legal-documents${qs}`, token);
}

export async function fetchAdminLegalDocument(token: string, documentId: string) {
  return authFetch<LegalDocumentDetail>(`/admin/legal-documents/${documentId}`, token);
}

export async function createAdminLegalDocument(
  token: string,
  payload: { slug: string; title: string; category: string; audience: LegalDocumentAudience; requiresAcceptance?: boolean },
) {
  return authFetch<LegalDocumentRecord>(`/admin/legal-documents`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function updateAdminLegalDocument(
  token: string,
  documentId: string,
  payload: { title?: string; audience?: LegalDocumentAudience; requiresAcceptance?: boolean },
) {
  return authFetch<LegalDocumentRecord>(`/admin/legal-documents/${documentId}`, token, {
    method: "PATCH", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function createAdminLegalDocumentVersion(
  token: string,
  documentId: string,
  payload: { versionLabel: string; bodyMarkdown: string; effectiveDate?: string },
) {
  return authFetch<LegalDocumentVersionRecord>(`/admin/legal-documents/${documentId}/versions`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function updateAdminLegalDocumentVersion(
  token: string,
  documentId: string,
  versionId: string,
  payload: { versionLabel?: string; bodyMarkdown?: string; effectiveDate?: string },
) {
  return authFetch<LegalDocumentVersionRecord>(`/admin/legal-documents/${documentId}/versions/${versionId}`, token, {
    method: "PATCH", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function publishAdminLegalDocumentVersion(token: string, documentId: string, versionId: string) {
  return authFetch<LegalDocumentVersionRecord>(
    `/admin/legal-documents/${documentId}/versions/${versionId}/publish`, token,
    { method: "POST", suppressGlobalErrors: true },
  );
}

export async function fetchAdminLegalDocumentAcceptanceSummary(token: string, documentId: string) {
  return authFetch<{ currentVersionId: string | null; acceptedCount: number }>(
    `/admin/legal-documents/${documentId}/acceptances/summary`, token,
  );
}

// ── Compliance analyzer (Wave L3b) ──────────────────────────────────────

export type ComplianceCategory = { key: string; question: string };

export type ComplianceFindingDocument = { slug: string; title: string | null; status: "published" | "unpublished" | "missing"; versionLabel?: string | null };

export type ComplianceFinding = {
  category: string;
  question: string;
  severity: "low" | "medium" | "high";
  guidance: string;
  documents: ComplianceFindingDocument[];
};

export type ComplianceCheckRecord = {
  _id: string;
  featureName: string;
  featureDescription: string;
  intake: Record<string, boolean>;
  findings: ComplianceFinding[];
  aiNotes: string | null;
  severitySummary: "none" | "low" | "medium" | "high";
  status: "open" | "resolved" | "dismissed";
  resolvedAt: string | null;
  createdAt: string | null;
};

export async function fetchComplianceCategories(token: string) {
  return authFetch<{ categories: ComplianceCategory[] }>(`/admin/compliance-checks/categories`, token);
}

export async function fetchComplianceChecks(token: string, statusFilter?: string) {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return authFetch<{ complianceChecks: ComplianceCheckRecord[] }>(`/admin/compliance-checks${qs}`, token);
}

export async function fetchComplianceCheck(token: string, checkId: string) {
  return authFetch<ComplianceCheckRecord>(`/admin/compliance-checks/${checkId}`, token);
}

export async function createComplianceCheck(
  token: string,
  payload: { featureName: string; featureDescription: string; intake: Record<string, boolean> },
) {
  return authFetch<ComplianceCheckRecord>(`/admin/compliance-checks`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function resolveComplianceCheck(token: string, checkId: string) {
  return authFetch<ComplianceCheckRecord>(`/admin/compliance-checks/${checkId}/resolve`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

export async function dismissComplianceCheck(token: string, checkId: string) {
  return authFetch<ComplianceCheckRecord>(`/admin/compliance-checks/${checkId}/dismiss`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

// ── Data-subject requests (Wave C3) ─────────────────────────────────────────

export type DataSubjectRequestRecord = {
  id: string;
  userId: string;
  requester: { fullName: string | null; email: string | null } | null;
  requestType: "export" | "erasure";
  status: "pending" | "completed" | "rejected";
  note: string | null;
  adminNote: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

export async function fetchDataSubjectRequests(token: string, statusFilter?: string) {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return authFetch<{ requests: DataSubjectRequestRecord[] }>(`/admin/data-subject-requests${qs}`, token);
}

export async function approveDataSubjectRequest(token: string, requestId: string, adminNote?: string) {
  return authFetch<DataSubjectRequestRecord>(`/admin/data-subject-requests/${requestId}/approve`, token, {
    method: "POST", body: JSON.stringify({ adminNote }), suppressGlobalErrors: true,
  });
}

export async function rejectDataSubjectRequest(token: string, requestId: string, adminNote: string) {
  return authFetch<DataSubjectRequestRecord>(`/admin/data-subject-requests/${requestId}/reject`, token, {
    method: "POST", body: JSON.stringify({ adminNote }), suppressGlobalErrors: true,
  });
}

// ── Payment disputes (Wave D) ────────────────────────────────────────────────

export type DisputeMessageRecord = {
  id: string;
  templateCode: string | null;
  subject: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string | null;
};

export type DisputeRecord = {
  id: string;
  transactionId: string;
  transactionReference: string | null;
  amount: number | null;
  currency: string | null;
  filedBy: { fullName: string | null; email: string | null } | null;
  assignedAdmin: { fullName: string | null } | null;
  category: string;
  reason: string;
  status: "open" | "under_review" | "responded" | "resolved" | "refunded" | "rejected";
  refundAmount: number | null;
  decisionNote: string | null;
  infoRequestedAt: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  messages?: DisputeMessageRecord[];
};

export async function fetchAdminDisputes(token: string, statusFilter?: string) {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return authFetch<{ disputes: DisputeRecord[] }>(`/admin/disputes${qs}`, token);
}

export async function fetchAdminDispute(token: string, disputeId: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}`, token);
}

export async function assignAdminDispute(token: string, disputeId: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/assign`, token, { method: "POST", suppressGlobalErrors: true });
}

export async function requestAdminDisputeInfo(token: string, disputeId: string, documentsRequested: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/request-info`, token, {
    method: "POST", body: JSON.stringify({ documentsRequested }), suppressGlobalErrors: true,
  });
}

export async function addAdminDisputeNote(token: string, disputeId: string, note: string) {
  return authFetch<DisputeMessageRecord>(`/admin/disputes/${disputeId}/note`, token, {
    method: "POST", body: JSON.stringify({ note }), suppressGlobalErrors: true,
  });
}

export async function resolveAdminDispute(token: string, disputeId: string, decisionNote: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/resolve`, token, {
    method: "POST", body: JSON.stringify({ decisionNote }), suppressGlobalErrors: true,
  });
}

export async function refundAdminDispute(
  token: string, disputeId: string, payload: { refundAmount: number; isPartial: boolean; summary: string },
) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/refund`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function rejectAdminDispute(token: string, disputeId: string, rejectionReason: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/reject`, token, {
    method: "POST", body: JSON.stringify({ rejectionReason }), suppressGlobalErrors: true,
  });
}

export async function closeAdminDisputeNoResponse(token: string, disputeId: string) {
  return authFetch<DisputeRecord>(`/admin/disputes/${disputeId}/close-no-response`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

// ── Security incidents (Wave X1) ────────────────────────────────────────────

export type IncidentLogRecord = {
  id: string;
  entryType: "containment" | "note" | "status_change";
  body: string;
  createdAt: string | null;
};

export type SecurityIncidentRecord = {
  id: string;
  title: string;
  description: string;
  severity: "critica" | "alta" | "media" | "baixa";
  createdBy: string | null;
  assignedTo: string | null;
  containedAt: string | null;
  impactAssessedAt: string | null;
  isPersonalDataBreach: boolean | null;
  riskLevel: "none" | "low" | "high" | null;
  affectedDataCategories: string | null;
  affectedSubjectCountEstimate: number | null;
  notificationDeadline: string | null;
  hoursRemaining: number | null;
  authorityNotifiedAt: string | null;
  subjectsNotifiedAt: string | null;
  clientNotifiedAt: string | null;
  remediatedAt: string | null;
  remediationNotes: string | null;
  closedAt: string | null;
  postIncidentReviewNotes: string | null;
  postIncidentReviewDueAt: string | null;
  createdAt: string | null;
  log?: IncidentLogRecord[];
};

export async function fetchAdminSecurityIncidents(token: string, openOnly = false) {
  return authFetch<{ incidents: SecurityIncidentRecord[] }>(`/admin/security-incidents${openOnly ? "?openOnly=true" : ""}`, token);
}

export async function fetchAdminSecurityIncident(token: string, incidentId: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}`, token);
}

export async function createAdminSecurityIncident(
  token: string, payload: { title: string; description: string; severity: string },
) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function containAdminSecurityIncident(token: string, incidentId: string, action: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/contain`, token, {
    method: "POST", body: JSON.stringify({ action }), suppressGlobalErrors: true,
  });
}

export async function assessAdminSecurityIncident(
  token: string, incidentId: string,
  payload: { isPersonalDataBreach: boolean; riskLevel?: string; affectedDataCategories: string; affectedSubjectCountEstimate?: number },
) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/assess`, token, {
    method: "POST", body: JSON.stringify(payload), suppressGlobalErrors: true,
  });
}

export async function notifyAuthorityAdminSecurityIncident(token: string, incidentId: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/notify-authority`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

export async function notifySubjectsAdminSecurityIncident(token: string, incidentId: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/notify-subjects`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

export async function notifyClientAdminSecurityIncident(token: string, incidentId: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/notify-client`, token, {
    method: "POST", suppressGlobalErrors: true,
  });
}

export async function remediateAdminSecurityIncident(token: string, incidentId: string, notes: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/remediate`, token, {
    method: "POST", body: JSON.stringify({ notes }), suppressGlobalErrors: true,
  });
}

export async function closeAdminSecurityIncident(token: string, incidentId: string, reviewNotes: string) {
  return authFetch<SecurityIncidentRecord>(`/admin/security-incidents/${incidentId}/close`, token, {
    method: "POST", body: JSON.stringify({ reviewNotes }), suppressGlobalErrors: true,
  });
}

export async function noteAdminSecurityIncident(token: string, incidentId: string, note: string) {
  return authFetch<IncidentLogRecord>(`/admin/security-incidents/${incidentId}/note`, token, {
    method: "POST", body: JSON.stringify({ note }), suppressGlobalErrors: true,
  });
}
