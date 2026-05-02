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
  listAdminActions,
  createAdminUser,
  updateUserAdminLevel,
  suspendUser,
  moderateJob,
  createAdCampaign,
  listAds,
  updateAdCampaign,
  deleteAdCampaign,
  listActiveAdsByPlacement,
  trackAdImpression,
  trackAdClick,
  createScrapedJob,
  reviewScrapedJob,
  exportUsersCsv,
  exportJobsCsv,
  exportCompaniesCsv,
} from "../controller/admin.js";
import { verifyToken, requireRole, requirePermission, requireAdminLevel } from "../middleware/auth.js";
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
router.get("/admin-actions", requirePermission(Permissions.ADMIN_ADMIN_ACTIONS_VIEW), listAdminActions);
router.post("/users/admin", requirePermission(Permissions.ADMIN_ADMINS_PROMOTE), createAdminUser);
router.patch("/users/:id/suspend", requirePermission(Permissions.ADMIN_USERS_SUSPEND), suspendUser);
router.patch("/users/:id/admin-level", requirePermission(Permissions.ADMIN_ADMINS_PROMOTE), updateUserAdminLevel);
router.patch("/jobs/:id/moderate", requirePermission(Permissions.ADMIN_JOBS_MODERATE), moderateJob);
router.post("/ads", requirePermission(Permissions.ADMIN_ADS_CREATE), createAdCampaign);
router.get("/ads", requirePermission(Permissions.ADMIN_ADS_MANAGE), listAds);
router.patch("/ads/:id", requirePermission(Permissions.ADMIN_ADS_MANAGE), updateAdCampaign);
router.delete("/ads/:id", requirePermission(Permissions.ADMIN_ADS_MANAGE), deleteAdCampaign);
router.get("/ads/placements/active", listActiveAdsByPlacement);
router.post("/ads/:id/impression", trackAdImpression);
router.post("/ads/:id/click", trackAdClick);
router.post("/scraped-jobs", requirePermission(Permissions.ADMIN_SCRAPED_CREATE), createScrapedJob);
router.patch("/scraped-jobs/:id/review", requirePermission(Permissions.ADMIN_SCRAPED_REVIEW), reviewScrapedJob);
router.get("/exports/users.csv", requirePermission(Permissions.ADMIN_EXPORT_USERS), exportUsersCsv);
router.get("/exports/jobs.csv", requirePermission(Permissions.ADMIN_EXPORT_JOBS), exportJobsCsv);
router.get("/exports/companies.csv", requirePermission(Permissions.ADMIN_EXPORT_COMPANIES), exportCompaniesCsv);

export default router;
