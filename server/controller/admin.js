import Job from "../models/job.js";
import bcrypt from "bcrypt";
import ScrapedJob from "../models/scrapedJob.js";
import AdCampaign from "../models/adCampaign.js";
import User from "../models/user.js";
import Company from "../models/company.js";
import Application from "../models/application.js";
import AuditLog from "../models/auditLog.js";
import AdminAction from "../models/adminAction.js";
import { logAdminAction } from "../services/auditService.js";
import { Permissions, hasPermission, normalizeAdminLevel } from "../services/rbacService.js";
import { JobStatuses, canTransitionJobStatus, isPlatformReviewRequired } from "../services/jobWorkflowService.js";

const scrapedStatuses = new Set(["pending", "approved", "rejected", "duplicate", "archived", "merged"]);
const placements = new Set(["homepage_banner", "sidebar", "inline", "newsletter"]);
const readinessRequiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "JWT_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_API_URL",
  "CORS_ORIGIN",
  "STORAGE_PROVIDER",
  "EMAIL_HOST",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM",
];

const looksPlaceholder = (value) => /your-|change-me|example|localhost|127\.0\.0\.1|parvagas\.local/i.test(String(value || ""));
const ANALYTICS_CACHE_TTL_MS = 45 * 1000;
const analyticsCache = new Map();

const getCachedAnalytics = (cacheKey) => {
  const cached = analyticsCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts > ANALYTICS_CACHE_TTL_MS) {
    analyticsCache.delete(cacheKey);
    return null;
  }
  return cached.value;
};

const setCachedAnalytics = (cacheKey, value) => {
  analyticsCache.set(cacheKey, { ts: Date.now(), value });
};

const pushReadinessCheck = (checks, id, scope, status, message) => {
  checks.push({ id, scope, status, message });
};

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toDateRangeFilter = (from, to) => {
  const start = toIso(from);
  const end = toIso(to);
  if (!start && !end) return {};
  if (start && end && start > end) return null;

  return {
    createdAt: {
      ...(start ? { $gte: start } : {}),
      ...(end ? { $lte: end } : {}),
    },
  };
};

const toDate = (value, fallback) => {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
};

const clampDateRange = (from, to) => {
  const end = toDate(to, new Date());
  const start = toDate(from, new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000));
  if (start > end) return null;
  return { start, end };
};

const monthKey = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const bucketByMonth = (items = [], mapper = () => 1) => {
  const buckets = new Map();
  for (const item of items) {
    const key = monthKey(item.createdAt);
    if (!key) continue;
    buckets.set(key, (buckets.get(key) || 0) + Number(mapper(item) || 0));
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
};

const countByField = (items = [], field, fallback = "desconhecido") => {
  const counts = new Map();
  for (const item of items) {
    const key = String(item?.[field] || fallback).trim() || fallback;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
};

const percentDelta = (current, previous) => {
  const safeCurrent = Number(current || 0);
  const safePrevious = Number(previous || 0);
  if (safePrevious === 0 && safeCurrent === 0) return 0;
  if (safePrevious === 0) return 100;
  return Math.round(((safeCurrent - safePrevious) / safePrevious) * 100);
};

const simpleForecast = (series = []) => {
  if (!Array.isArray(series) || series.length === 0) return 0;
  if (series.length === 1) return Number(series[0]?.value || 0);
  const points = series.map((point) => Number(point.value || 0));
  const last = points[points.length - 1];
  const diffs = [];
  for (let i = 1; i < points.length; i += 1) {
    diffs.push(points[i] - points[i - 1]);
  }
  const recentDiffs = diffs.slice(-3);
  const avgDiff = recentDiffs.length
    ? recentDiffs.reduce((sum, value) => sum + value, 0) / recentDiffs.length
    : 0;
  return Math.max(0, Math.round(last + avgDiff));
};

const detectAnomaly = (metric, series = []) => {
  if (!Array.isArray(series) || series.length < 4) return null;
  const latest = Number(series[series.length - 1]?.value || 0);
  const baselineValues = series.slice(0, -1).map((point) => Number(point.value || 0));
  const baselineAvg = baselineValues.length
    ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
    : 0;
  if (baselineAvg <= 0) return null;
  const changePct = Math.round(((latest - baselineAvg) / baselineAvg) * 100);
  if (Math.abs(changePct) < 40) return null;
  return {
    metric,
    severity: Math.abs(changePct) >= 80 ? "high" : "medium",
    direction: changePct > 0 ? "up" : "down",
    changePct,
    latest,
    baseline: Math.round(baselineAvg),
  };
};

const escapeCsv = (value) => {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

const buildCsv = (headers, rows) => {
  const top = headers.map(escapeCsv).join(",");
  const body = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return `${top}\n${body}\n`;
};

const getPagination = (req) => {
  const page = Math.max(Number.parseInt(String(req.query.page || "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "20"), 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const getSortSpec = (req, allowedSortFields = ["createdAt"], fallback = { createdAt: -1 }) => {
  const sortByRaw = String(req.query.sortBy || "").trim();
  const sortDirRaw = String(req.query.sortDir || "desc").trim().toLowerCase();
  const sortBy = allowedSortFields.includes(sortByRaw) ? sortByRaw : null;
  if (!sortBy) return fallback;
  return { [sortBy]: sortDirRaw === "asc" ? 1 : -1 };
};

const paginated = async (model, query, req, sort = { createdAt: -1 }) => {
  const { page, limit, skip } = getPagination(req);
  const [items, total] = await Promise.all([
    model.find(query).sort(sort).skip(skip).limit(limit),
    model.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
};

const withTextSearch = (query, keyword) => {
  const value = String(keyword || "").trim();
  return value ? { ...query, $text: { $search: value } } : query;
};

const createFingerprint = ({ title, company, location }) =>
  `${String(title || "").trim().toLowerCase()}::${String(company || "").trim().toLowerCase()}::${String(
    location || ""
  )
    .trim()
    .toLowerCase()}`;

export const createAdminUser = async (req, res) => {
  const { fullName, email, password, adminLevel } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!fullName || !normalizedEmail || !password) {
    return res.status(400).json({ error: "fullName, email e password são obrigatórios." });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "password deve ter pelo menos 8 caracteres." });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: "Email já está em uso." });
  }

  const salt = await bcrypt.genSalt();
  const passwordHash = await bcrypt.hash(String(password), salt);
  const admin = await User.create({
    fullName: String(fullName).trim(),
    email: normalizedEmail,
    password: passwordHash,
    role: "admin",
    adminLevel: normalizeAdminLevel(adminLevel),
    firstLoginRequired: true,
  });

  await logAdminAction({
    adminUserId: req.user.id,
    action: "admin.user.create",
    targetType: "User",
    targetId: String(admin._id),
    payload: { adminLevel: admin.adminLevel, email: normalizedEmail },
  });

  const user = admin.toObject();
  delete user.password;
  return res.status(201).json({ user });
};

export const adminOverview = async (_req, res) => {
  const [users, companies, jobs, scraped, ads] = await Promise.all([
    User.countDocuments(),
    Company.countDocuments(),
    Job.countDocuments(),
    ScrapedJob.countDocuments(),
    AdCampaign.countDocuments(),
  ]);

  return res.status(200).json({ users, companies, jobs, scraped, ads });
};

export const adminMe = async (req, res) => {
  const permissions = Object.values(Permissions).filter((permission) => hasPermission(req.user, permission));
  return res.status(200).json({
    id: req.user.id,
    role: req.user.role,
    adminLevel: normalizeAdminLevel(req.user.adminLevel),
    permissions,
  });
};

export const adminAnalytics = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) {
    return res.status(400).json({ error: "Intervalo de datas inválido." });
  }

  const clamped = clampDateRange(from, to);
  if (!clamped) {
    return res.status(400).json({ error: "Intervalo de datas inválido." });
  }

  const cacheKey = JSON.stringify({
    level: normalizeAdminLevel(req.user.adminLevel),
    from: toIso(from) || clamped.start.toISOString(),
    to: toIso(to) || clamped.end.toISOString(),
  });
  const cached = getCachedAnalytics(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, cache: { hit: true, ttlMs: ANALYTICS_CACHE_TTL_MS } });
  }

  const previousWindowMs = clamped.end.getTime() - clamped.start.getTime();
  const previousEnd = new Date(clamped.start.getTime() - 1000);
  const previousStart = new Date(previousEnd.getTime() - previousWindowMs);
  const prevDateFilter = {
    createdAt: {
      $gte: previousStart.toISOString(),
      $lte: previousEnd.toISOString(),
    },
  };

  const [
    users,
    companies,
    jobs,
    scraped,
    ads,
    applications,
    pendingJobs,
    pendingCompanies,
    suspendedUsers,
    pendingScraped,
    prevUsers,
    prevCompanies,
    prevJobs,
    prevApplications,
    jobsInRange,
    usersInRange,
    applicationsInRange,
    adsInRange,
    prevAdsInRange,
    companiesInRange,
  ] = await Promise.all([
    User.countDocuments(dateFilter),
    Company.countDocuments(dateFilter),
    Job.countDocuments(dateFilter),
    ScrapedJob.countDocuments(dateFilter),
    AdCampaign.countDocuments(dateFilter),
    Application.countDocuments(dateFilter),
    Job.countDocuments({ ...dateFilter, status: { $in: [JobStatuses.PENDING_PLATFORM_REVIEW] } }),
    Company.countDocuments({ ...dateFilter, verificationStatus: { $in: ["pending", "needs_more_info"] } }),
    User.countDocuments({ ...dateFilter, suspended: true }),
    ScrapedJob.countDocuments({ ...dateFilter, status: "pending" }),
    User.countDocuments(prevDateFilter),
    Company.countDocuments(prevDateFilter),
    Job.countDocuments(prevDateFilter),
    Application.countDocuments(prevDateFilter),
    Job.find(dateFilter),
    User.find(dateFilter),
    Application.find(dateFilter),
    AdCampaign.find(dateFilter),
    AdCampaign.find(prevDateFilter),
    Company.find(dateFilter),
  ]);

  const activeApplications = applicationsInRange.filter((item) => !["withdrawn", "rejected", "hired"].includes(String(item.status || ""))).length;
  const revenueInRange = adsInRange.reduce((sum, ad) => sum + Number(ad.spent || ad.budget || 0), 0);
  const jobsPostedSeries = bucketByMonth(jobsInRange);
  const userSignupsSeries = bucketByMonth(usersInRange);
  const applicationsSeries = bucketByMonth(applicationsInRange);
  const revenueSeries = bucketByMonth(adsInRange, (ad) => Number(ad.spent || ad.budget || 0));

  const anomalies = [
    detectAnomaly("jobsPosted", jobsPostedSeries),
    detectAnomaly("userSignups", userSignupsSeries),
    detectAnomaly("applications", applicationsSeries),
  ].filter(Boolean);

  const payload = {
    range: { from: clamped.start.toISOString(), to: clamped.end.toISOString() },
    totals: { users, companies, jobs, scraped, ads, applications },
    operational: {
      pendingJobs,
      pendingCompanies,
      suspendedUsers,
      pendingScraped,
      activeApplications,
    },
    trends: {
      usersPct: percentDelta(users, prevUsers),
      companiesPct: percentDelta(companies, prevCompanies),
      jobsPct: percentDelta(jobs, prevJobs),
      applicationsPct: percentDelta(applications, prevApplications),
      revenuePct: null,
    },
    series: {
      jobsPosted: jobsPostedSeries,
      userSignups: userSignupsSeries,
      applications: applicationsSeries,
      revenue: revenueSeries,
    },
    distributions: {
      applicationStatus: countByField(applicationsInRange, "status"),
      jobsByStatus: countByField(jobsInRange, "status"),
      companyVerification: countByField(companiesInRange, "verificationStatus"),
      jobLocationDensity: countByField(jobsInRange, "location").slice(0, 12),
      userLocationDensity: countByField(usersInRange, "location").slice(0, 12),
    },
    business: {
      revenueInRange,
      adCountInRange: adsInRange.length,
    },
    insights: {
      anomalies,
      forecasts: {
        jobsPostedNext: simpleForecast(jobsPostedSeries),
        userSignupsNext: simpleForecast(userSignupsSeries),
        applicationsNext: simpleForecast(applicationsSeries),
        revenueNext: simpleForecast(revenueSeries),
      },
    },
    cache: { hit: false, ttlMs: ANALYTICS_CACHE_TTL_MS },
  };

  const adminLevel = normalizeAdminLevel(req.user.adminLevel);
  if (adminLevel === "super-admin") {
    payload.trends.revenuePct = percentDelta(
      revenueInRange,
      prevAdsInRange.reduce((sum, ad) => sum + Number(ad.spent || ad.budget || 0), 0)
    );
  } else {
    payload.business = {
      revenueInRange: null,
      adCountInRange: null,
    };
    payload.series.revenue = [];
    payload.insights.forecasts.revenueNext = null;
  }

  setCachedAnalytics(cacheKey, payload);

  return res.status(200).json(payload);
};

export const adminLaunchReadiness = async (req, res) => {
  const checkServices = String(req.query.checkServices || "false") === "true";
  const checks = [];

  for (const name of readinessRequiredEnv) {
    if (!process.env[name]) {
      pushReadinessCheck(checks, `env.${name}`, "env", "fail", `${name} is required for production.`);
    } else {
      pushReadinessCheck(checks, `env.${name}`, "env", "pass", `${name} is configured.`);
    }
  }

  const jwtSecret = String(process.env.JWT_SECRET || "");
  if (jwtSecret.length < 32 || looksPlaceholder(jwtSecret)) {
    pushReadinessCheck(
      checks,
      "env.jwt_secret_strength",
      "env",
      "fail",
      "JWT_SECRET must be a non-placeholder value with at least 32 characters."
    );
  } else {
    pushReadinessCheck(checks, "env.jwt_secret_strength", "env", "pass", "JWT secret length looks production-suitable.");
  }

  const storageProvider = String(process.env.STORAGE_PROVIDER || "").trim().toLowerCase();
  if (storageProvider !== "supabase") {
    pushReadinessCheck(
      checks,
      "env.storage_provider",
      "env",
      "fail",
      "STORAGE_PROVIDER must be supabase in production so CVs are not stored on local disk."
    );
  } else {
    pushReadinessCheck(checks, "env.storage_provider", "env", "pass", "Storage provider is set to supabase.");
  }

  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (!/^https:\/\//.test(siteUrl)) {
    pushReadinessCheck(checks, "env.site_url", "env", "fail", "NEXT_PUBLIC_SITE_URL must be an HTTPS URL.");
  } else {
    pushReadinessCheck(checks, "env.site_url", "env", "pass", "NEXT_PUBLIC_SITE_URL is HTTPS.");
  }

  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "");
  if (!/^https:\/\//.test(apiUrl)) {
    pushReadinessCheck(checks, "env.api_url", "env", "fail", "NEXT_PUBLIC_API_URL must be an HTTPS URL.");
  } else {
    pushReadinessCheck(checks, "env.api_url", "env", "pass", "NEXT_PUBLIC_API_URL is HTTPS.");
  }

  const corsOrigins = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!corsOrigins.length) {
    pushReadinessCheck(checks, "env.cors_origin", "env", "warn", "CORS_ORIGIN is not configured.");
  } else if (corsOrigins.some((origin) => looksPlaceholder(origin))) {
    pushReadinessCheck(
      checks,
      "env.cors_origin",
      "env",
      "fail",
      "CORS_ORIGIN must not include localhost or placeholder origins in production."
    );
  } else {
    pushReadinessCheck(checks, "env.cors_origin", "env", "pass", "CORS origins do not include obvious placeholders.");
  }

  const emailFrom = String(process.env.EMAIL_FROM || "");
  if (!emailFrom.includes("@") || looksPlaceholder(emailFrom)) {
    pushReadinessCheck(checks, "env.email_from", "env", "fail", "EMAIL_FROM must be a real sender email address.");
  } else {
    pushReadinessCheck(checks, "env.email_from", "env", "pass", "EMAIL_FROM appears valid.");
  }

  if (checkServices) {
    try {
      await Promise.all([User.countDocuments(), Company.countDocuments(), Job.countDocuments()]);
      pushReadinessCheck(checks, "service.database", "service", "pass", "Database connectivity is healthy.");
    } catch (error) {
      pushReadinessCheck(
        checks,
        "service.database",
        "service",
        "fail",
        `Database connectivity check failed: ${error.message}`
      );
    }
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc.total += 1;
      if (check.status === "pass") acc.pass += 1;
      if (check.status === "warn") acc.warn += 1;
      if (check.status === "fail") acc.fail += 1;
      return acc;
    },
    { total: 0, pass: 0, warn: 0, fail: 0 }
  );

  return res.status(200).json({
    checkServices,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
  });
};

export const exportUsersCsv = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) return res.status(400).json({ error: "Intervalo de datas inválido." });

  const users = await User.find(dateFilter).sort({ createdAt: -1 }).limit(5000);
  const csv = buildCsv(
    ["id", "fullName", "email", "role", "adminLevel", "suspended", "createdAt"],
    users.map((user) => [
      user._id,
      user.fullName,
      user.email,
      user.role,
      user.role === "admin" ? normalizeAdminLevel(user.adminLevel) : "",
      Boolean(user.suspended),
      user.createdAt,
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=parvagas-users.csv");
  await logAdminAction({
    adminUserId: req.user.id,
    action: "exports.users.csv",
    targetType: "User",
    targetId: "bulk",
    payload: { from: req.query.from || null, to: req.query.to || null },
  });
  return res.status(200).send(csv);
};

export const exportJobsCsv = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) return res.status(400).json({ error: "Intervalo de datas inválido." });

  const jobs = await Job.find(dateFilter).sort({ createdAt: -1 }).limit(5000).populate("companyId");
  const csv = buildCsv(
    ["id", "title", "company", "location", "category", "status", "visibility", "createdAt"],
    jobs.map((job) => [
      job._id,
      job.title,
      typeof job.companyId === "object" ? job.companyId?.name : job.companyId,
      job.location,
      job.category,
      job.status,
      job.visibility,
      job.createdAt,
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=parvagas-jobs.csv");
  await logAdminAction({
    adminUserId: req.user.id,
    action: "exports.jobs.csv",
    targetType: "Job",
    targetId: "bulk",
    payload: { from: req.query.from || null, to: req.query.to || null },
  });
  return res.status(200).send(csv);
};

export const exportCompaniesCsv = async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) return res.status(400).json({ error: "Intervalo de datas inválido." });

  const companies = await Company.find(dateFilter).sort({ createdAt: -1 }).limit(5000);
  const csv = buildCsv(
    ["id", "name", "industry", "location", "verificationStatus", "contactEmail", "createdAt"],
    companies.map((company) => [
      company._id,
      company.name,
      company.industry,
      company.location,
      company.verificationStatus,
      company.contactEmail,
      company.createdAt,
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=parvagas-companies.csv");
  await logAdminAction({
    adminUserId: req.user.id,
    action: "exports.companies.csv",
    targetType: "Company",
    targetId: "bulk",
    payload: { from: req.query.from || null, to: req.query.to || null },
  });
  return res.status(200).send(csv);
};

export const listUsers = async (req, res) => {
  const { role, suspended, adminLevel, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(role ? { role } : {}),
      ...(adminLevel ? { adminLevel: normalizeAdminLevel(adminLevel) } : {}),
      ...(suspended === "true" ? { suspended: true } : {}),
      ...(suspended === "false" ? { suspended: false } : {}),
    },
    keyword
  );
  const { items: users, pagination } = await paginated(User, query, req);
  return res.status(200).json({ users, pagination });
};

export const listCompanies = async (req, res) => {
  const { status, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(status && status !== "all" ? { verificationStatus: status } : {}),
    },
    keyword
  );
  const sort = getSortSpec(req, ["createdAt", "name", "verificationStatus"], { createdAt: -1 });
  const { items: companies, pagination } = await paginated(Company, query, req, sort);
  return res.status(200).json({ companies, pagination });
};

export const listJobs = async (req, res) => {
  const { status, visibility, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(status && status !== "all" ? { status } : {}),
      ...(visibility && visibility !== "all" ? { visibility } : {}),
    },
    keyword
  );
  const sort = getSortSpec(req, ["createdAt", "title", "status", "location"], { createdAt: -1 });
  const { items: jobs, pagination } = await paginated(Job, query, req, sort);
  return res.status(200).json({ jobs, pagination });
};

export const listApplications = async (req, res) => {
  const { status, companyId, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(status && status !== "all" ? { status } : {}),
      ...(companyId && companyId !== "all" ? { companyId } : {}),
    },
    keyword
  );

  const sort = getSortSpec(req, ["createdAt", "status"], { createdAt: -1 });
  const { items: applications, pagination } = await paginated(Application, query, req, sort);
  return res.status(200).json({ applications, pagination });
};

export const listScrapedJobs = async (req, res) => {
  const { status, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(status && status !== "all" ? { status } : {}),
    },
    keyword
  );
  const { items: scrapedJobs, pagination } = await paginated(ScrapedJob, query, req);
  return res.status(200).json({ scrapedJobs, pagination });
};

export const listAuditLogs = async (req, res) => {
  const { action, resourceType, actorUserId, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    },
    keyword
  );
  const { items: auditLogs, pagination } = await paginated(AuditLog, query, req);
  return res.status(200).json({ auditLogs, pagination });
};

export const listAdminActions = async (req, res) => {
  const { action, targetType, adminUserId, keyword } = req.query;
  const query = withTextSearch(
    {
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(adminUserId ? { adminUserId } : {}),
    },
    keyword
  );
  const { items: adminActions, pagination } = await paginated(AdminAction, query, req);
  return res.status(200).json({ adminActions, pagination });
};

export const updateUserAdminLevel = async (req, res) => {
  const { id } = req.params;
  const adminLevel = normalizeAdminLevel(req.body.adminLevel);
  const reason = String(req.body.reason || "").trim();
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ error: "Utilizador não encontrado." });
  if (user.role !== "admin") {
    return res.status(400).json({ error: "Apenas utilizadores admin têm adminLevel." });
  }
  if (!reason) {
    return res.status(400).json({ error: "reason é obrigatório para alterar adminLevel." });
  }

  const updated = await User.findByIdAndUpdate(id, { adminLevel }, { new: true });

  await logAdminAction({
    adminUserId: req.user.id,
    action: "user.adminLevel.update",
    targetType: "User",
    targetId: String(updated._id),
    payload: { adminLevel, reason },
  });

  return res.status(200).json({ user: updated });
};

export const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { suspended } = req.body;
  const reason = String(req.body.reason || "").trim();
  if (!reason) {
    return res.status(400).json({ error: "reason é obrigatório para suspender/reativar utilizadores." });
  }
  const user = await User.findByIdAndUpdate(id, { suspended: Boolean(suspended) }, { new: true });
  if (!user) return res.status(404).json({ error: "Utilizador não encontrado." });

  await logAdminAction({
    adminUserId: req.user.id,
    action: Boolean(suspended) ? "user.suspend" : "user.reactivate",
    targetType: "User",
    targetId: String(user._id),
    payload: { suspended: Boolean(suspended), reason },
  });

  return res.status(200).json({ user });
};

export const moderateJob = async (req, res) => {
  const { id } = req.params;
  const { status, visibility, reason } = req.body;

  const job = await Job.findById(id);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });

  if (status) {
    const normalizedStatus = String(status).trim();
    if (!canTransitionJobStatus(job.status, normalizedStatus)) {
      return res.status(400).json({ error: `Transição inválida de ${job.status || "(vazio)"} para ${normalizedStatus}.` });
    }
    if (
      job.status === JobStatuses.PENDING_COMPANY_APPROVAL &&
      ![JobStatuses.PENDING_PLATFORM_REVIEW, JobStatuses.ARCHIVED].includes(normalizedStatus)
    ) {
      return res.status(400).json({ error: "Aprovação interna da empresa deve ser feita pelo gestor da empresa." });
    }
    job.status = normalizedStatus;
  }
  if (visibility) job.visibility = visibility;
  if (reason) job.platformModerationReason = String(reason).trim();
  await job.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "job.moderate",
    targetType: "Job",
    targetId: String(job._id),
    payload: { status, visibility, reason: reason || "" },
  });

  return res.status(200).json({ job });
};

export const createAdCampaign = async (req, res) => {
  const payload = req.body || {};
  if (!payload.title || !payload.placement || !payload.link || !payload.startDate || !payload.endDate) {
    return res.status(400).json({ error: "title, placement, link, startDate e endDate são obrigatórios." });
  }
  if (!placements.has(String(payload.placement))) {
    return res.status(400).json({ error: "placement inválido." });
  }
  if (new Date(payload.startDate).getTime() > new Date(payload.endDate).getTime()) {
    return res.status(400).json({ error: "startDate deve ser anterior a endDate." });
  }

  const ad = await AdCampaign.create({
    title: String(payload.title).trim(),
    placement: payload.placement,
    link: String(payload.link).trim(),
    imageUrl: payload.imageUrl || "",
    active: payload.active !== false,
    startDate: payload.startDate,
    endDate: payload.endDate,
    budget: Number(payload.budget || 0),
    status: payload.status || "active",
  });
  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.create",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: { title: ad.title, placement: ad.placement },
  });
  return res.status(201).json({ ad });
};

export const listAds = async (_req, res) => {
  const ads = await AdCampaign.find({}).sort({ createdAt: -1 }).limit(500);
  return res.status(200).json({ ads });
};

export const updateAdCampaign = async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const ad = await AdCampaign.findById(id);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });

  if (payload.placement && !placements.has(String(payload.placement))) {
    return res.status(400).json({ error: "placement inválido." });
  }

  Object.assign(ad, payload);
  await ad.save();
  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.update",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload,
  });

  return res.status(200).json({ ad });
};

export const deleteAdCampaign = async (req, res) => {
  const { id } = req.params;
  const ad = await AdCampaign.findByIdAndDelete(id);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });
  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.delete",
    targetType: "AdCampaign",
    targetId: String(id),
  });
  return res.status(200).json({ deleted: true });
};

export const listActiveAdsByPlacement = async (req, res) => {
  const { placement } = req.query;
  const now = new Date().toISOString();

  const filter = {
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    ...(placement ? { placement } : {}),
  };

  const ads = await AdCampaign.find(filter).sort({ createdAt: -1 });
  return res.status(200).json({ ads });
};

export const trackAdImpression = async (req, res) => {
  const { id } = req.params;
  const ad = await AdCampaign.findByIdAndUpdate(id, { $inc: { impressions: 1 } }, { new: true });
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });
  return res.status(200).json({ impressions: ad.impressions });
};

export const trackAdClick = async (req, res) => {
  const { id } = req.params;
  const ad = await AdCampaign.findByIdAndUpdate(id, { $inc: { clicks: 1 } }, { new: true });
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });
  return res.status(200).json({ clicks: ad.clicks, link: ad.link });
};

export const createScrapedJob = async (req, res) => {
  const payload = req.body || {};
  if (!payload.title || !payload.company) {
    return res.status(400).json({ error: "title e company são obrigatórios para scraped jobs." });
  }
  const duplicateFingerprint = createFingerprint(payload);
  const existing = await ScrapedJob.findOne({ duplicateFingerprint });

  const scraped = await ScrapedJob.create({
    ...payload,
    duplicateFingerprint,
    status: "pending",
    duplicateOf: existing?._id || null,
  });

  return res.status(201).json({ scraped, duplicateDetected: Boolean(existing) });
};

export const reviewScrapedJob = async (req, res) => {
  const { id } = req.params;
  const { status, reviewNote, mergeIntoScrapedJobId, publishAsPublicJob, companyId } = req.body || {};

  const scraped = await ScrapedJob.findById(id);
  if (!scraped) return res.status(404).json({ error: "Registo scraped não encontrado." });

  if (!scrapedStatuses.has(String(status || ""))) {
    return res.status(400).json({ error: "status inválido para scraped review." });
  }

  scraped.status = String(status);
  scraped.reviewedBy = req.user.id;
  scraped.reviewNote = reviewNote || "";
  if (mergeIntoScrapedJobId) {
    scraped.status = "merged";
    scraped.duplicateOf = mergeIntoScrapedJobId;
  }

  await scraped.save();

  if (scraped.status === "approved" && publishAsPublicJob === true) {
    const targetStatus = isPlatformReviewRequired(scraped, false) ? JobStatuses.PENDING_PLATFORM_REVIEW : JobStatuses.PUBLISHED;
    await Job.create({
      title: scraped.title,
      companyId,
      location: scraped.location,
      category: scraped.category,
      requiredSkills: scraped.skills,
      description: scraped.description,
      visibility: "public",
      status: targetStatus,
      sourceType: "scraped",
      sourceUrl: scraped.sourceUrl,
      createdByUserId: req.user.id,
    });
  }

  await logAdminAction({
    adminUserId: req.user.id,
    action: "scraped.review",
    targetType: "ScrapedJob",
    targetId: String(scraped._id),
    payload: { status: scraped.status, publishAsPublicJob: Boolean(publishAsPublicJob), mergeIntoScrapedJobId: mergeIntoScrapedJobId || null },
  });

  return res.status(200).json({ scraped });
};
