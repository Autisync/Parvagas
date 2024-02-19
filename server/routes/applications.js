import express from "express";
import { getApplications, getApplication, createApplication, updateApplicationStatus, deleteApplication} from "../controller/applications.js";
import { verifyToken } from "../middleware/auth.js";
import {upload} from '../middleware/uploads.js'

const router = express.Router();

/* READ */
router.get("/",  verifyToken, getApplications);
router.get("/:id", verifyToken, getApplication);

/* CREATE */
// const cvUpload = upload.fields([{ name: 'file-upload', maxCount: 1 }, { name: 'extrafile-upload', maxCount: 8 }])
// router.post("/application/", cvUpload, createApplication); // ROUTE WITH FILES
router.post("/application/", createApplication); // ROUTE WITH OUT FILES


/* UPDATE */
router.patch("/:id/status", verifyToken, updateApplicationStatus);

/* DELETE */
router.delete("/:id/delete", verifyToken, deleteApplication);


export default router;