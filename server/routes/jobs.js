import express from "express";
import { listPublicJobs, getPublicJobDetail, listPublicCompanies } from "../controller/jobs.js";

const router = express.Router();

router.get("/", listPublicJobs);
router.get("/companies", listPublicCompanies);
router.get("/:id", getPublicJobDetail);

export default router;
