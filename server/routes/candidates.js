import express from "express";
import multer from "multer";
import {
  uploadCvAndParse,
  approveAndSaveProfile,
  getMyProfile,
  updateMyProfile,
  createProfileSummaryDraft,
  completeOnboarding,
  markTutorialSeen,
  listCvDocuments,
  deleteCvDocument,
  createGeneratedCvProfile,
  listGeneratedCvProfiles,
  updateGeneratedCvProfile,
  duplicateGeneratedCvProfile,
  deleteGeneratedCvProfile,
  getRecommendedJobs,
  saveJob,
  getSavedJobs,
  unsaveJob,
  applyToJob,
  getMyApplications,
  createJobAlert,
  getJobAlerts,
  updateJobAlert,
  deleteJobAlert,
  updateNotificationPreferences,
  getNotificationPreferences,
} from "../controller/candidates.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.post("/cv/parse", verifyToken, requireRole("candidate"), upload.single("cv"), uploadCvAndParse);
router.get("/cv/documents", verifyToken, requireRole("candidate"), listCvDocuments);
router.delete("/cv/documents/:id", verifyToken, requireRole("candidate"), deleteCvDocument);
router.post("/profile/approve", verifyToken, requireRole("candidate"), approveAndSaveProfile);
router.get("/profile", verifyToken, requireRole("candidate"), getMyProfile);
router.patch("/profile", verifyToken, requireRole("candidate"), updateMyProfile);
router.post("/profile/summary-draft", verifyToken, requireRole("candidate"), createProfileSummaryDraft);
router.patch("/onboarding/complete", verifyToken, requireRole("candidate"), completeOnboarding);
router.patch("/tutorial/seen", verifyToken, requireRole("candidate"), markTutorialSeen);
router.post("/cv-profiles/generate", verifyToken, requireRole("candidate"), createGeneratedCvProfile);
router.get("/cv-profiles", verifyToken, requireRole("candidate"), listGeneratedCvProfiles);
router.patch("/cv-profiles/:id", verifyToken, requireRole("candidate"), updateGeneratedCvProfile);
router.post("/cv-profiles/:id/duplicate", verifyToken, requireRole("candidate"), duplicateGeneratedCvProfile);
router.delete("/cv-profiles/:id", verifyToken, requireRole("candidate"), deleteGeneratedCvProfile);
router.get("/jobs/recommended", verifyToken, requireRole("candidate"), getRecommendedJobs);
router.post("/jobs/save", verifyToken, requireRole("candidate"), saveJob);
router.get("/jobs/saved", verifyToken, requireRole("candidate"), getSavedJobs);
router.delete("/jobs/saved/:id", verifyToken, requireRole("candidate"), unsaveJob);
router.post(
  "/jobs/apply",
  verifyToken,
  requireRole("candidate"),
  upload.single("customCv"),
  applyToJob
);
router.get("/applications", verifyToken, requireRole("candidate"), getMyApplications);
router.post("/alerts", verifyToken, requireRole("candidate"), createJobAlert);
router.get("/alerts", verifyToken, requireRole("candidate"), getJobAlerts);
router.patch("/alerts/:id", verifyToken, requireRole("candidate"), updateJobAlert);
router.delete("/alerts/:id", verifyToken, requireRole("candidate"), deleteJobAlert);
router.get("/notifications/preferences", verifyToken, requireRole("candidate"), getNotificationPreferences);
router.put(
  "/notifications/preferences",
  verifyToken,
  requireRole("candidate"),
  updateNotificationPreferences
);

export default router;
