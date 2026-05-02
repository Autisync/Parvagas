import express from "express";
import {
	getApplications,
	getApplication,
	createApplication,
	updateApplicationStatus,
	deleteApplication,
	getApplicationCandidateCv,
} from "../controller/applications.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/* READ */
router.get("/",  verifyToken, getApplications);
router.get("/:id/candidate-cv", verifyToken, getApplicationCandidateCv);
router.get("/:id", verifyToken, getApplication);

/* CREATE */
router.post("/", verifyToken, createApplication);


/* UPDATE */
router.patch("/:id/status", verifyToken, updateApplicationStatus);

/* DELETE */
router.delete("/:id", verifyToken, deleteApplication);


export default router;