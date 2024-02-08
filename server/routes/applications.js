import express from "express";
import { getApplications, getApplication, createApplication, updateApplicationStatus } from "../controller/applications.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/* READ */
router.get("/",  verifyToken, getApplications);
router.get("/:id", verifyToken, getApplication);

/* CREATE */
router.post('/submit', verifyToken, createApplication);

/* UPDATE */
router.patch("/:id/status", verifyToken, updateApplicationStatus);


export default router;