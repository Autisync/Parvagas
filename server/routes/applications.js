import express from "express";
import { getApplications, getApplication, approveApplication, rejectApplication } from "../controllers/posts.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/* READ */
router.get("/", getApplications);
router.get("/:id", verifyToken, getApplication);

/* UPDATE */
router.patch("/:id/approve", verifyToken, approveApplication);
router.patch("/:id/reject", verifyToken, rejectApplication);

export default router;