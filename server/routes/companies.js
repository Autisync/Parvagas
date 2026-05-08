import express from "express";
import multer from "multer";
import {
  registerCompany,
  getMyCompany,
  markEmpresaTutorialSeen,
  updateMyCompany,
  uploadCompanyLogo,
  createJob,
  updateCompanyJob,
  getCompanyJobs,
  getCompanyJobApprovals,
  reviewCompanyJobApproval,
  getCompanyApplications,
  inviteCompanyMember,
  listCompanyMembers,
  listCompanyInvites,
  resendCompanyInvite,
  revokeCompanyInvite,
  updateCompanyMemberRole,
  removeCompanyMember,
  getCompanyAuditTimeline,
  heartbeatCompanyPresence,
  getCompanyPresenceStatus,
  verifyCompany,
  previewVerificationEmail,
  sendVerificationEmail,
  requestCompanyDeletion,
  listCompanyDeletionRequests,
  reviewCompanyDeletionRequest,
} from "../controller/companies.js";
import { verifyToken, requireRole, requirePermission } from "../middleware/auth.js";
import { Permissions } from "../services/rbacService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

router.post("/register", verifyToken, registerCompany);
router.get("/me", verifyToken, requireRole("company", "admin"), getMyCompany);
router.get("/profile", verifyToken, requireRole("company", "admin"), getMyCompany);
router.patch("/tutorial/seen", verifyToken, requireRole("company"), markEmpresaTutorialSeen);
router.patch("/profile", verifyToken, requireRole("company", "admin"), updateMyCompany);
router.post("/profile/logo", verifyToken, requireRole("company", "admin"), upload.single("logo"), uploadCompanyLogo);
router.post("/jobs", verifyToken, requireRole("company", "admin"), createJob);
router.patch("/jobs/:id", verifyToken, requireRole("company", "admin"), updateCompanyJob);
router.get("/jobs", verifyToken, requireRole("company", "admin"), getCompanyJobs);
router.get("/job-approvals", verifyToken, requireRole("company", "admin"), getCompanyJobApprovals);
router.patch("/job-approvals/:id/review", verifyToken, requireRole("company", "admin"), reviewCompanyJobApproval);
router.get("/applications", verifyToken, requireRole("company", "admin"), getCompanyApplications);

router.get("/team", verifyToken, requireRole("company", "admin"), listCompanyMembers);
router.post("/team/invites", verifyToken, requireRole("company", "admin"), inviteCompanyMember);
router.get("/team/invites", verifyToken, requireRole("company", "admin"), listCompanyInvites);
router.post("/team/invites/:id/resend", verifyToken, requireRole("company", "admin"), resendCompanyInvite);
router.patch("/team/invites/:id/revoke", verifyToken, requireRole("company", "admin"), revokeCompanyInvite);
router.patch("/team/members/:id/role", verifyToken, requireRole("company", "admin"), updateCompanyMemberRole);
router.delete("/team/members/:id", verifyToken, requireRole("company", "admin"), removeCompanyMember);

router.get("/audit-timeline", verifyToken, requireRole("company", "admin"), getCompanyAuditTimeline);
router.post("/presence/heartbeat", verifyToken, requireRole("company", "admin"), heartbeatCompanyPresence);
router.get("/presence/status", verifyToken, requireRole("company", "admin"), getCompanyPresenceStatus);

router.patch("/:id/verification", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), verifyCompany);
router.post("/:id/verification/preview-email", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), previewVerificationEmail);
router.post("/:id/verification/send-email", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), sendVerificationEmail);
router.post("/:id/deletion-request", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), requestCompanyDeletion);
router.get("/deletion-requests", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), listCompanyDeletionRequests);
router.patch("/deletion-requests/:id/review", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), reviewCompanyDeletionRequest);

export default router;
