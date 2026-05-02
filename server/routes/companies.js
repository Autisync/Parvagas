import express from "express";
import {
  registerCompany,
  getMyCompany,
  updateMyCompany,
  createJob,
  updateCompanyJob,
  getCompanyJobs,
  getCompanyJobApprovals,
  reviewCompanyJobApproval,
  getCompanyApplications,
  verifyCompany,
} from "../controller/companies.js";
import { verifyToken, requireRole, requirePermission } from "../middleware/auth.js";
import { Permissions } from "../services/rbacService.js";

const router = express.Router();

router.post("/register", verifyToken, registerCompany);
router.get("/me", verifyToken, requireRole("company", "admin"), getMyCompany);
router.get("/profile", verifyToken, requireRole("company", "admin"), getMyCompany);
router.patch("/profile", verifyToken, requireRole("company", "admin"), updateMyCompany);
router.post("/jobs", verifyToken, requireRole("company", "admin"), createJob);
router.patch("/jobs/:id", verifyToken, requireRole("company", "admin"), updateCompanyJob);
router.get("/jobs", verifyToken, requireRole("company", "admin"), getCompanyJobs);
router.get("/job-approvals", verifyToken, requireRole("company", "admin"), getCompanyJobApprovals);
router.patch("/job-approvals/:id/review", verifyToken, requireRole("company", "admin"), reviewCompanyJobApproval);
router.get("/applications", verifyToken, requireRole("company", "admin"), getCompanyApplications);
router.patch("/:id/verification", verifyToken, requireRole("admin"), requirePermission(Permissions.ADMIN_COMPANIES_VERIFY), verifyCompany);

export default router;
