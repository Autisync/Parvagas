import express from "express";
import { getApplications, getApplication, createApplication, updateApplicationStatus, deleteApplication} from "../controller/applications.js";
import { verifyToken } from "../middleware/auth.js";
import {upload} from '../middleware/uploads.js'

const router = express.Router();

/* READ */
router.get("/",  verifyToken, getApplications);
router.get("/:id", verifyToken, getApplication);

/* CREATE */
router.post("/applications/", upload.single("docs"), createApplication); // ROUTE WITH FILES


/* UPDATE */
router.patch("/:id/status", verifyToken, updateApplicationStatus);

/* DELETE */
router.delete("/:id/delete", verifyToken, deleteApplication);


export default router;