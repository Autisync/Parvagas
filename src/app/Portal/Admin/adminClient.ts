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
  createdAt?: string;
};

export type JobRecord = {
  _id: string;
  title?: string;
  status?: string;
  visibility?: string;
  location?: string;
  category?: string;
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
  description?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  companyLogoUrl?: string | null;
  companyWebsite?: string | null;
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

export async function fetchJobs(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"jobs", JobRecord>>(`/admin/jobs${listQuery(params)}`, token);
}

export async function fetchApplications(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"applications", ApplicationRecord>>(`/admin/applications${listQuery(params)}`, token);
}

export async function fetchCompanies(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"companies", CompanyRecord>>(`/admin/companies${listQuery(params)}`, token);
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

export async function downloadAuditLogsCsv(token: string, params: Record<string, string | number | undefined> = {}) {
  const query = listQuery(params);
  return downloadCsv(`/admin/audit-logs/export.csv${query}`, token, "parvagas-audit-logs.csv");
}

export async function fetchAdminActions(token: string, params: Record<string, string | number | undefined> = {}) {
  return authFetch<Paginated<"adminActions", AdminActionRecord>>(`/admin/admin-actions${listQuery(params)}`, token);
}

export async function fetchLaunchReadiness(token: string, checkServices = false) {
  return authFetch<LaunchReadinessResponse>(`/admin/launch-readiness${listQuery({ checkServices: checkServices ? "true" : undefined })}`, token);
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
