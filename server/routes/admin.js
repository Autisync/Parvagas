import express from "express";
import {
  adminMe,
  adminOverview,
  adminAnalytics,
  adminLaunchReadiness,
  listUsers,
  listCompanies,
  listJobs,
  listApplications,
  listScrapedJobs,
  listAuditLogs,
  exportAuditLogsCsv,
  listAdminActions,
  createAdminUser,
  createManagedUser,
  updateUserAdminLevel,
  suspendUser,
  moderateJob,
  flagJob,
  createAdCampaign,
  listAds,
  updateAdCampaign,
  replaceAdCampaign,
  setAdCampaignStatus,
  pauseAdCampaign,
  flagAdCampaign,
  deleteAdCampaign,
  listActiveAdsByPlacement,
  trackAdImpression,
  trackAdClick,
  createScrapedJob,
  updateScrapedJob,
  reviewScrapedJob,
  deleteScrapedJob,
  exportUsersCsv,
  exportJobsCsv,
  exportCompaniesCsv,
} from "../controller/admin.js";
import { verifyToken, requireRole, requirePermission, requireAnyPermission, requireAdminLevel } from "../middleware/auth.js";
import { Permissions } from "../services/rbacService.js";

const router = express.Router();

router.use(verifyToken, requireRole("admin"));

router.get("/me", adminMe);
router.get("/overview", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), adminOverview);
router.get("/analytics", requirePermission(Permissions.ADMIN_ANALYTICS_VIEW), adminAnalytics);
router.get("/launch-readiness", requireAdminLevel("super-admin"), adminLaunchReadiness);
router.get("/users", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), listUsers);
router.get("/companies", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), listCompanies);
router.get("/jobs", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), listJobs);
router.get("/applications", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), listApplications);
router.get("/scraped-jobs", requirePermission(Permissions.ADMIN_DASHBOARD_VIEW), listScrapedJobs);
router.get("/audit-logs", requirePermission(Permissions.ADMIN_AUDIT_LOGS_VIEW), listAuditLogs);
router.get("/audit-logs/export.csv", requirePermission(Permissions.ADMIN_AUDIT_LOGS_VIEW), exportAuditLogsCsv);
router.get("/admin-actions", requirePermission(Permissions.ADMIN_ADMIN_ACTIONS_VIEW), listAdminActions);
router.post("/users", requirePermission(Permissions.ADMIN_ADMINS_PROMOTE), createManagedUser);
router.post("/users/admin", requirePermission(Permissions.ADMIN_ADMINS_PROMOTE), createAdminUser);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/admin-level", requirePermission(Permissions.ADMIN_ADMINS_PROMOTE), updateUserAdminLevel);
router.patch(
  "/jobs/:id/moderate",
  requireAnyPermission(Permissions.ADMIN_JOBS_MODERATE, Permissions.JOB_REVIEW, Permissions.JOB_APPROVE, Permissions.JOB_REJECT),
  moderateJob
);
router.post("/jobs/:id/flag", requireAnyPermission(Permissions.AD_FLAG, Permissions.ADMIN_JOBS_MODERATE), flagJob);
router.post("/ads", requireAnyPermission(Permissions.ADMIN_ADS_CREATE, Permissions.AD_DRAFT), createAdCampaign);
router.get("/ads", requireAnyPermission(Permissions.ADMIN_ADS_MANAGE, Permissions.AD_DRAFT, Permissions.AD_FLAG, Permissions.AD_PAUSE), listAds);
router.patch("/ads/:id", requireAnyPermission(Permissions.ADMIN_ADS_MANAGE, Permissions.AD_DRAFT, Permissions.AD_PAUSE), updateAdCampaign);
router.put("/ads/:id", requireAnyPermission(Permissions.ADMIN_ADS_MANAGE, Permissions.AD_DRAFT, Permissions.AD_PAUSE), replaceAdCampaign);
router.patch("/ads/:id/status", requireAnyPermission(Permissions.ADMIN_ADS_MANAGE, Permissions.AD_PUBLISH, Permissions.AD_PAUSE), setAdCampaignStatus);
router.patch("/ads/:id/pause", requireAnyPermission(Permissions.AD_PAUSE, Permissions.ADMIN_ADS_MANAGE), pauseAdCampaign);
router.post("/ads/:id/flag", requireAnyPermission(Permissions.AD_FLAG, Permissions.ADMIN_ADS_MANAGE), flagAdCampaign);
router.delete("/ads/:id", requirePermission(Permissions.ADMIN_ADS_MANAGE), deleteAdCampaign);
router.get("/ads/placements/active", listActiveAdsByPlacement);
router.post("/ads/:id/impression", trackAdImpression);
router.post("/ads/:id/click", trackAdClick);
router.post("/scraped-jobs", requirePermission(Permissions.ADMIN_SCRAPED_CREATE), createScrapedJob);
router.patch("/scraped-jobs/:id", requirePermission(Permissions.ADMIN_SCRAPED_EDIT), updateScrapedJob);
router.patch("/scraped-jobs/:id/review", requirePermission(Permissions.ADMIN_SCRAPED_REVIEW), reviewScrapedJob);
router.delete("/scraped-jobs/:id", requirePermission(Permissions.ADMIN_SCRAPED_EDIT), deleteScrapedJob);
router.get("/exports/users.csv", requirePermission(Permissions.ADMIN_EXPORT_USERS), exportUsersCsv);
router.get("/exports/jobs.csv", requirePermission(Permissions.ADMIN_EXPORT_JOBS), exportJobsCsv);
router.get("/exports/companies.csv", requirePermission(Permissions.ADMIN_EXPORT_COMPANIES), exportCompaniesCsv);

export default router;
