const DEFAULT_ADMIN_LEVEL = "super-admin";

export const normalizeAdminLevel = (value) => {
  const level = String(value || "").trim().toLowerCase();
  return level === "moderator" ? "moderator" : DEFAULT_ADMIN_LEVEL;
};

export const Permissions = {
  JOB_REVIEW: "job.review",
  JOB_APPROVE: "job.approve",
  JOB_REJECT: "job.reject",
  AD_FLAG: "ad.flag",
  AD_PAUSE: "ad.pause",
  AD_DRAFT: "ad.draft",
  AD_PUBLISH: "ad.publish",
  ADMIN_DASHBOARD_VIEW: "admin.dashboard.view",
  ADMIN_ANALYTICS_VIEW: "admin.analytics.view",
  ADMIN_JOBS_MODERATE: "admin.jobs.moderate",
  ADMIN_SCRAPED_CREATE: "admin.scrapedJobs.create",
  ADMIN_SCRAPED_EDIT: "admin.scrapedJobs.edit",
  ADMIN_SCRAPED_REVIEW: "admin.scrapedJobs.review",
  ADMIN_COMPANIES_VERIFY: "admin.companies.verify",
  ADMIN_COMPANIES_REJECT: "admin.companies.reject",
  ADMIN_COMPANIES_SUSPEND: "admin.companies.suspend",
  ADMIN_USERS_SUSPEND: "admin.users.suspend",
  ADMIN_USERS_REACTIVATE: "admin.users.reactivate",
  ADMIN_ADMINS_PROMOTE: "admin.admins.promote",
  ADMIN_ADMINS_DEMOTE: "admin.admins.demote",
  ADMIN_AUDIT_LOGS_VIEW: "admin.auditLogs.view",
  ADMIN_ADMIN_ACTIONS_VIEW: "admin.adminActionLogs.view",
  ADMIN_ADS_CREATE: "admin.ads.create",
  ADMIN_ADS_MANAGE: "admin.ads.manage",
  ADMIN_EXPORT_USERS: "admin.exports.users",
  ADMIN_EXPORT_JOBS: "admin.exports.jobs",
  ADMIN_EXPORT_COMPANIES: "admin.exports.companies",
  ADMIN_CANDIDATE_CV_VIEW: "admin.candidateCv.view",
};

const moderatorPermissions = new Set([
  Permissions.JOB_REVIEW,
  Permissions.JOB_APPROVE,
  Permissions.JOB_REJECT,
  Permissions.AD_FLAG,
  Permissions.AD_PAUSE,
  Permissions.AD_DRAFT,
  Permissions.ADMIN_DASHBOARD_VIEW,
  Permissions.ADMIN_ANALYTICS_VIEW,
  Permissions.ADMIN_JOBS_MODERATE,
  Permissions.ADMIN_SCRAPED_CREATE,
  Permissions.ADMIN_SCRAPED_EDIT,
  Permissions.ADMIN_SCRAPED_REVIEW,
  Permissions.ADMIN_COMPANIES_VERIFY,
  Permissions.ADMIN_COMPANIES_REJECT,
  Permissions.ADMIN_CANDIDATE_CV_VIEW,
]);

const superAdminPermissions = new Set([...Object.values(Permissions)]);

const getPermissionSetForUser = (user) => {
  if (user?.role !== "admin") return new Set();
  const level = normalizeAdminLevel(user?.adminLevel);
  return level === "moderator" ? moderatorPermissions : superAdminPermissions;
};

export const hasPermission = (user, permission) => getPermissionSetForUser(user).has(permission);

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: "Permissão insuficiente.", permission });
    }
    return next();
  };
};

export const requireAnyPermission = (...permissions) => {
  return (req, res, next) => {
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    if (!allowed) {
      return res.status(403).json({ error: "Permissão insuficiente.", permissions });
    }
    return next();
  };
};

export const canModerateJob = (user) => hasPermission(user, Permissions.ADMIN_JOBS_MODERATE);
export const canManageAdmins = (user) =>
  hasPermission(user, Permissions.ADMIN_ADMINS_PROMOTE) || hasPermission(user, Permissions.ADMIN_ADMINS_DEMOTE);
