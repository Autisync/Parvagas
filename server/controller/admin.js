import Job from "../models/job.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import ScrapedJob from "../models/scrapedJob.js";
import AdCampaign from "../models/adCampaign.js";
import User from "../models/user.js";
import Company from "../models/company.js";
import CandidateProfile from "../models/candidateProfile.js";
import Application from "../models/application.js";
import AuditLog from "../models/auditLog.js";
import AdminAction from "../models/adminAction.js";
import { logAdminAction } from "../services/auditService.js";
import { sendEmailNotification } from "../services/notificationService.js";
import { Permissions, hasPermission, normalizeAdminLevel } from "../services/rbacService.js";
import { JobStatuses, canTransitionJobStatus, isPlatformReviewRequired } from "../services/jobWorkflowService.js";
import { validateAdCampaignPayload, validateSuspensionRequest } from "../services/adminValidationService.js";
import { applyJobModeration } from "../services/jobModerationService.js";

const scrapedStatuses = new Set(["pending", "approved", "rejected", "duplicate", "archived", "merged"]);
const placements = new Set(["homepage_banner", "sidebar", "inline", "newsletter"]);
const managedUserRoles = new Set(["candidate", "company", "admin"]);
const managedCredentialDeliveryModes = new Set(["set_password_link", "temporary_password"]);
const TEMP_PASSWORD_TTL_MINUTES = Number(process.env.TEMP_PASSWORD_TTL_MINUTES || 60);
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

const isDateOnlyInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const parseBoundaryDate = (value, boundary = "start") => {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = isDateOnlyInput(raw)
    ? `${raw}T${boundary === "end" ? "23:59:59.999" : "00:00:00.000"}Z`
    : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toIso = (value, boundary = "start") => {
  const date = parseBoundaryDate(value, boundary);
  return date ? date.toISOString() : null;
};

const toDateRangeFilter = (from, to) => {
  const start = toIso(from, "start");
  const end = toIso(to, "end");
  if (!start && !end) return {};
  if (start && end && start > end) return null;

  return {
    createdAt: {
      ...(start ? { $gte: start } : {}),
      ...(end ? { $lte: end } : {}),
    },
  };
};

const toDate = (value, fallback, boundary = "start") => {
  const parsed = parseBoundaryDate(value, boundary);
  return parsed || fallback;
};

const clampDateRange = (from, to) => {
  const end = toDate(to, new Date(), "end");
  const start = toDate(from, new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000), "start");
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

const validatePasswordStrength = (password) => {
  if (String(password || "").length < 8) return "A password deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A password deve incluir pelo menos 1 letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A password deve incluir pelo menos 1 letra minúscula.";
  if (!/[0-9]/.test(password)) return "A password deve incluir pelo menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A password deve incluir pelo menos 1 símbolo.";
  return "";
};

export const generateTemporaryPassword = (length = 14) => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{}";
  const all = `${upper}${lower}${digits}${symbols}`;

  const pick = (source) => source[crypto.randomInt(0, source.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join("");
};

const getPublicSiteUrl = () => {
  const raw = String(process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim();
  return raw.replace(/\/$/, "");
};

const getSecurePortalUrl = (path) => {
  const base = getPublicSiteUrl();
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  try {
    const parsed = new URL(base);
    if (parsed.protocol === "http:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      parsed.protocol = "https:";
    }
    return `${parsed.toString().replace(/\/$/, "")}${normalizedPath}`;
  } catch {
    return `${base}${normalizedPath}`;
  }
};

const issueFirstAccessResetToken = async (user, expiresIn = "20m") => {
  const jti = crypto.randomUUID();
  const resetToken = jwt.sign(
    {
      userId: user._id,
      purpose: "first-login-reset",
      role: user.role,
      jti,
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  const decoded = jwt.decode(resetToken);
  const expSeconds = Number(decoded?.exp || 0);
  const expiresAt = expSeconds > 0 ? new Date(expSeconds * 1000).toISOString() : null;

  await User.findByIdAndUpdate(user._id, {
    firstAccessResetJti: jti,
    firstAccessResetExpiresAt: expiresAt,
  });

  return { resetToken, expiresAt };
};

export const buildCredentialEmailPayload = ({ fullName, email, role, temporaryPassword, credentialDeliveryMode, loginPath, firstAccessPath }) => {
  const loginUrl = getSecurePortalUrl(loginPath);
  const firstAccessUrl = firstAccessPath ? getSecurePortalUrl(firstAccessPath) : "";

  const policySummary = [
    "Política de password: mínimo de 8 caracteres, com maiúscula, minúscula, número e símbolo.",
    `A credencial temporária expira em ${TEMP_PASSWORD_TTL_MINUTES} minutos.`,
  ].join("\n");

  const securityAdvice = "Por segurança, altere a password imediatamente após o primeiro acesso e não partilhe estas credenciais.";

  const subject = "Parvagas | Acesso inicial à plataforma";
  const lines = [
    `Olá ${String(fullName || "utilizador").trim()},`,
    "",
    "A sua conta foi criada por um administrador no Parvagas.",
    `Perfil: ${role}`,
    `Utilizador (email): ${String(email || "").trim().toLowerCase()}`,
  ];

  if (credentialDeliveryMode === "temporary_password") {
    lines.push(`Password temporária: ${temporaryPassword}`);
  }

  lines.push(
    "",
    credentialDeliveryMode === "set_password_link"
      ? `Defina a sua password através do link único (expiração curta): ${firstAccessUrl}`
      : `Entre no portal e redefina a password no primeiro login: ${loginUrl}`,
    `Portal de login: ${loginUrl}`,
    "",
    policySummary,
    securityAdvice
  );

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111827;">
      <h2 style="margin:0 0 10px;">Bem-vindo ao Parvagas</h2>
      <p>Olá <strong>${String(fullName || "utilizador").trim()}</strong>,</p>
      <p>A sua conta foi criada por um administrador.</p>
      <p><strong>Perfil:</strong> ${role}<br/><strong>Utilizador (email):</strong> ${String(email || "").trim().toLowerCase()}</p>
      ${credentialDeliveryMode === "temporary_password" ? `<p><strong>Password temporária:</strong> ${temporaryPassword}</p>` : ""}
      <p>
        ${credentialDeliveryMode === "set_password_link"
          ? `Defina a password pelo link único: <a href="${firstAccessUrl}">${firstAccessUrl}</a><br/>`
          : ""}
        Login: <a href="${loginUrl}">${loginUrl}</a>
      </p>
      <p><strong>Política de password:</strong> mínimo de 8 caracteres, com maiúscula, minúscula, número e símbolo.<br/>
      <strong>Expiração da credencial temporária:</strong> ${TEMP_PASSWORD_TTL_MINUTES} minutos.</p>
      <p>Altere a password imediatamente após o primeiro acesso e não partilhe credenciais.</p>
    </div>
  `;

  return { subject, body: lines.join("\n"), html };
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

const sanitizeAuditDetails = (details = {}) => {
  const blocked = new Set(["password", "token", "accessToken", "refreshToken", "authorization"]);
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const next = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      if (blocked.has(String(key).toLowerCase())) continue;
      next[key] = walk(fieldValue);
    }
    return next;
  };
  return walk(details);
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

export const createManagedUser = async (req, res) => {
  const {
    fullName,
    email,
    role = "admin",
    adminLevel,
    companyName,
    legalName,
    nif,
    contactPerson,
    credentialDeliveryMode = "set_password_link",
  } = req.body || {};

  const normalizedRole = String(role || "admin").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedDelivery = String(credentialDeliveryMode || "set_password_link").trim().toLowerCase();
  const normalizedName = String(fullName || "").trim();

  if (!normalizedName || !normalizedEmail) {
    return res.status(400).json({ error: "fullName e email são obrigatórios." });
  }
  if (!managedUserRoles.has(normalizedRole)) {
    return res.status(400).json({ error: "role inválido. Use candidate, company ou admin." });
  }
  if (!managedCredentialDeliveryModes.has(normalizedDelivery)) {
    return res.status(400).json({ error: "credentialDeliveryMode inválido. Use set_password_link ou temporary_password." });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: "Email já está em uso." });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);
  if (passwordError) {
    return res.status(500).json({ error: "Falha ao gerar password temporária forte." });
  }

  const salt = await bcrypt.genSalt();
  const passwordHash = await bcrypt.hash(temporaryPassword, salt);
  const tempPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MINUTES * 60 * 1000).toISOString();

  const userPayload = {
    fullName: normalizedName,
    email: normalizedEmail,
    password: passwordHash,
    role: normalizedRole,
    firstLoginRequired: true,
    forcePasswordReset: true,
    tempPasswordExpiresAt,
    ...(normalizedRole === "admin" ? { adminLevel: normalizeAdminLevel(adminLevel) } : {}),
  };

  const managedUser = await User.create(userPayload);

  if (normalizedRole === "company") {
    const normalizedNif = String(nif || `AUTO-${crypto.randomUUID().slice(0, 8)}`).trim().toUpperCase();
    const company = await Company.create({
      name: String(companyName || `${normalizedName} Company`).trim(),
      legalName: String(legalName || companyName || `${normalizedName} Company`).trim(),
      nif: normalizedNif,
      status: "pending_verification",
      ownerUserId: managedUser._id,
      createdByUserId: req.user.id,
      contactPerson: String(contactPerson || normalizedName).trim(),
      contactEmail: normalizedEmail,
      verificationStatus: "pending",
    });

    await User.findByIdAndUpdate(managedUser._id, {
      companyId: company._id,
      companyTeamRole: "owner",
      companyStatus: "pending_verification",
    });
  }

  if (normalizedRole === "candidate") {
    await CandidateProfile.findOneAndUpdate(
      { userId: managedUser._id },
      {
        userId: managedUser._id,
        fullName: normalizedName,
        email: normalizedEmail,
        phone: "",
        location: "",
        professionalTitle: "",
        summary: "",
        skills: [],
        experience: [],
        education: [],
      },
      { new: true, upsert: true }
    );
  }

  let firstAccessPath = "";
  if (normalizedDelivery === "set_password_link") {
    const { resetToken } = await issueFirstAccessResetToken(managedUser, `${TEMP_PASSWORD_TTL_MINUTES}m`);
    firstAccessPath = normalizedRole === "admin"
      ? `/Admin/Login?firstLoginToken=${encodeURIComponent(resetToken)}`
      : `/Login?firstLoginToken=${encodeURIComponent(resetToken)}&role=${normalizedRole === "company" ? "company" : "candidate"}`;
  }

  const loginPath = normalizedRole === "admin" ? "/Admin/Login" : `/Login?role=${normalizedRole === "company" ? "company" : "candidate"}`;
  const emailPayload = buildCredentialEmailPayload({
    fullName: normalizedName,
    email: normalizedEmail,
    role: normalizedRole,
    temporaryPassword,
    credentialDeliveryMode: normalizedDelivery,
    loginPath,
    firstAccessPath,
  });

  const emailDelivery = await sendEmailNotification({
    userId: managedUser._id,
    toEmail: normalizedEmail,
    subject: emailPayload.subject,
    body: emailPayload.body,
    html: emailPayload.html,
  });

  await logAdminAction({
    adminUserId: req.user.id,
    action: "admin.user.create",
    targetType: "User",
    targetId: String(managedUser._id),
    payload: {
      role: normalizedRole,
      adminLevel: normalizeAdminLevel(adminLevel),
      email: normalizedEmail,
      credentialDeliveryMode: normalizedDelivery,
      tempPasswordExpiresAt,
      emailDeliveryStatus: emailDelivery?.status || "skipped",
    },
  });

  const user = managedUser.toObject();
  delete user.password;

  return res.status(201).json({
    user,
    emailDelivery: {
      status: emailDelivery?.status || "skipped",
      error: emailDelivery?.error || "",
    },
    credentialDeliveryMode: normalizedDelivery,
    tempPasswordExpiresAt,
    // Security note: set_password_link is preferred because it avoids sending passwords via email.
  });
};

export const createAdminUser = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    role: "admin",
  };
  return createManagedUser(req, res);
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
    from: toIso(from, "start") || clamped.start.toISOString(),
    to: toIso(to, "end") || clamped.end.toISOString(),
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
  const statusFilter = status && status !== "all"
    ? {
        $or: [
          { status },
          {
            verificationStatus:
              status === "active"
                ? "verified"
                : status === "pending_verification"
                ? "pending"
                : status,
          },
        ],
      }
    : {};

  const query = withTextSearch(statusFilter, keyword);
  const sort = getSortSpec(req, ["createdAt", "name", "status", "verificationStatus"], { createdAt: -1 });
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
  const { action, resourceType, actorUserId, keyword, from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) {
    return res.status(400).json({ error: "Intervalo de datas inválido." });
  }

  const query = {
    ...dateFilter,
    ...(action ? { action } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  };

  const effectiveQuery = withTextSearch(query, keyword);

  const sort = getSortSpec(req, ["createdAt", "action", "resourceType", "resourceId"], { createdAt: -1 });
  const { items: auditLogs, pagination } = await paginated(AuditLog, effectiveQuery, req, sort);
  return res.status(200).json({ auditLogs, pagination });
};

export const exportAuditLogsCsv = async (req, res) => {
  const { action, resourceType, actorUserId, keyword, from, to } = req.query;
  const dateFilter = toDateRangeFilter(from, to);
  if (dateFilter === null) return res.status(400).json({ error: "Intervalo de datas inválido." });

  const query = withTextSearch({
    ...dateFilter,
    ...(action ? { action } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  }, keyword);

  const rows = await AuditLog.find(query).sort({ createdAt: -1 }).limit(5000);
  const csv = buildCsv(
    ["date", "userId", "action", "target", "targetId", "details"],
    rows.map((entry) => [
      entry.createdAt,
      entry.actorUserId || "",
      entry.action || "",
      entry.resourceType || "",
      entry.resourceId || "",
      JSON.stringify(sanitizeAuditDetails(entry.details || {})),
    ])
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=parvagas-audit-logs.csv");
  return res.status(200).send(csv);
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

  const requestError = validateSuspensionRequest({
    actorAdminLevel: normalizeAdminLevel(req.user?.adminLevel),
    actorUserId: req.user?.id,
    targetUserId: id,
    suspended,
    reason,
  });
  if (requestError) {
    return res.status(requestError.status).json({ error: requestError.message });
  }

  const existing = await User.findById(id);
  if (!existing) return res.status(404).json({ error: "Utilizador não encontrado." });

  const user = await User.findByIdAndUpdate(id, { suspended }, { new: true });

  await logAdminAction({
    adminUserId: req.user.id,
    action: suspended ? "user.suspend" : "user.reactivate",
    targetType: "User",
    targetId: String(user._id),
    payload: { suspended, reason },
  });

  return res.status(200).json({ user });
};

export const moderateJob = async (req, res) => {
  const { id } = req.params;
  const { status, visibility, reason } = req.body;
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "approved" && !hasPermission(req.user, Permissions.JOB_APPROVE)) {
    return res.status(403).json({ error: "Permissão insuficiente.", permission: Permissions.JOB_APPROVE });
  }
  if (normalizedStatus === "platform_rejected" && !hasPermission(req.user, Permissions.JOB_REJECT)) {
    return res.status(403).json({ error: "Permissão insuficiente.", permission: Permissions.JOB_REJECT });
  }
  if (normalizedStatus === "published" && !hasPermission(req.user, Permissions.ADMIN_JOBS_MODERATE)) {
    return res.status(403).json({ error: "Publicação direta é restrita para administradores." });
  }
  if (
    ["archived", ""].includes(normalizedStatus) &&
    !hasPermission(req.user, Permissions.JOB_REVIEW) &&
    !hasPermission(req.user, Permissions.ADMIN_JOBS_MODERATE)
  ) {
    return res.status(403).json({ error: "Permissão insuficiente.", permission: Permissions.JOB_REVIEW });
  }

  const job = await Job.findById(id);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });

  try {
    applyJobModeration(job, { status, visibility, reason });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
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

export const flagJob = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "reason é obrigatório para sinalizar vagas." });

  const job = await Job.findById(id);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });

  const moderationFlags = Array.isArray(job.moderationFlags) ? [...job.moderationFlags] : [];
  moderationFlags.push({
    flaggedByUserId: req.user.id,
    reason,
    createdAt: new Date().toISOString(),
  });
  job.moderationFlags = moderationFlags;
  await job.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "job.flag",
    targetType: "Job",
    targetId: String(job._id),
    payload: { reason },
  });

  return res.status(200).json({ job });
};

export const createAdCampaign = async (req, res) => {
  const payload = req.body || {};
  const validationError = validateAdCampaignPayload(payload);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const canPublish = hasPermission(req.user, Permissions.AD_PUBLISH) || hasPermission(req.user, Permissions.ADMIN_ADS_MANAGE);

  const ad = await AdCampaign.create({
    title: String(payload.title).trim(),
    placement: payload.placement,
    link: String(payload.link).trim(),
    imageUrl: payload.imageUrl || "",
    active: canPublish ? payload.active !== false : false,
    startDate: payload.startDate,
    endDate: payload.endDate,
    budget: Number(payload.budget || 0),
    status: canPublish ? payload.status || "active" : "draft",
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

  const validationError = validateAdCampaignPayload(
    {
      ...ad,
      ...payload,
    },
    { partial: true }
  );
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const canPublish = hasPermission(req.user, Permissions.AD_PUBLISH) || hasPermission(req.user, Permissions.ADMIN_ADS_MANAGE);
  const nextPayload = { ...payload };

  if (!canPublish) {
    if (Object.prototype.hasOwnProperty.call(nextPayload, "active") && nextPayload.active === true) {
      return res.status(403).json({ error: "Apenas administradores podem publicar anúncios." });
    }
    if (String(nextPayload.status || "").toLowerCase() === "active") {
      return res.status(403).json({ error: "Apenas administradores podem publicar anúncios." });
    }
  }

  Object.assign(ad, nextPayload);
  await ad.save();
  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.update",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: nextPayload,
  });

  return res.status(200).json({ ad });
};

export const replaceAdCampaign = async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const validationError = validateAdCampaignPayload(payload);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const ad = await AdCampaign.findById(id);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });

  const canPublish = hasPermission(req.user, Permissions.AD_PUBLISH) || hasPermission(req.user, Permissions.ADMIN_ADS_MANAGE);

  ad.title = String(payload.title).trim();
  ad.placement = String(payload.placement).trim();
  ad.link = String(payload.link).trim();
  ad.imageUrl = String(payload.imageUrl || "").trim();
  ad.startDate = payload.startDate;
  ad.endDate = payload.endDate;
  ad.active = canPublish ? payload.active !== false : false;
  ad.status = canPublish ? payload.status || (ad.active ? "active" : "inactive") : "draft";
  ad.budget = Number(payload.budget || 0);
  await ad.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.replace",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: {
      title: ad.title,
      placement: ad.placement,
      active: ad.active,
    },
  });

  return res.status(200).json({ ad });
};

export const setAdCampaignStatus = async (req, res) => {
  const { id } = req.params;
  const active = req.body?.active;
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active boolean é obrigatório." });
  }

  if (active && !hasPermission(req.user, Permissions.AD_PUBLISH) && !hasPermission(req.user, Permissions.ADMIN_ADS_MANAGE)) {
    return res.status(403).json({ error: "Apenas administradores podem publicar anúncios." });
  }

  const ad = await AdCampaign.findByIdAndUpdate(
    id,
    { active, status: active ? "active" : "inactive" },
    { new: true }
  );
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });

  await logAdminAction({
    adminUserId: req.user.id,
    action: active ? "ads.activate" : "ads.deactivate",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: { active },
  });

  return res.status(200).json({ ad });
};

export const pauseAdCampaign = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || "").trim();
  const ad = await AdCampaign.findById(id);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });

  ad.active = false;
  ad.status = "paused";
  ad.pauseReason = reason;
  ad.pausedByUserId = req.user.id;
  ad.pausedAt = new Date().toISOString();
  await ad.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.pause",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: { reason },
  });

  return res.status(200).json({ ad });
};

export const flagAdCampaign = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "reason é obrigatório para sinalizar anúncios." });

  const ad = await AdCampaign.findById(id);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });

  const flags = Array.isArray(ad.flags) ? [...ad.flags] : [];
  flags.push({ flaggedByUserId: req.user.id, reason, createdAt: new Date().toISOString() });
  ad.flags = flags;
  await ad.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "ads.flag",
    targetType: "AdCampaign",
    targetId: String(ad._id),
    payload: { reason },
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

export const updateScrapedJob = async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const scraped = await ScrapedJob.findById(id);
  if (!scraped) return res.status(404).json({ error: "Registo scraped não encontrado." });

  const editable = ["title", "company", "location", "source", "sourceUrl", "description", "category", "skills", "externalId"];
  for (const field of editable) {
    if (payload[field] !== undefined) scraped[field] = payload[field];
  }
  if (payload.title || payload.company || payload.location) {
    scraped.duplicateFingerprint = createFingerprint({
      title: payload.title ?? scraped.title,
      company: payload.company ?? scraped.company,
      location: payload.location ?? scraped.location,
    });
  }
  await scraped.save();

  await logAdminAction({
    adminUserId: req.user.id,
    action: "scraped.update",
    targetType: "ScrapedJob",
    targetId: String(scraped._id),
    payload: { fields: Object.keys(payload) },
  });

  return res.status(200).json({ scraped });
};

export const deleteScrapedJob = async (req, res) => {
  const { id } = req.params;
  const scraped = await ScrapedJob.findByIdAndDelete(id);
  if (!scraped) return res.status(404).json({ error: "Registo scraped não encontrado." });

  await logAdminAction({
    adminUserId: req.user.id,
    action: "scraped.delete",
    targetType: "ScrapedJob",
    targetId: String(id),
  });

  return res.status(200).json({ deleted: true });
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
