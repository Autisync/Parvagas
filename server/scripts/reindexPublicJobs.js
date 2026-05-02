import dotenv from "dotenv";
import Job from "../models/job.js";
import { resetPublicJobsIndex, indexPublicJobs } from "../services/searchService.js";

dotenv.config();

const run = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Skipping reindex: Supabase env vars are not configured.");
    return;
  }

  const jobs = await Job.find({ visibility: "public", status: "approved" }).lean();
  const documents = jobs.map((job) => ({
    id: String(job._id),
    title: job.title,
    companyId: String(job.companyId || ""),
    location: job.location,
    country: job.country,
    provinceCity: job.provinceCity,
    category: job.category,
    jobType: job.jobType,
    workMode: job.workMode,
    experienceLevel: job.experienceLevel,
    salaryRange: job.salaryRange,
    createdAt: job.createdAt,
  }));

  const reset = await resetPublicJobsIndex();
  const indexed = await indexPublicJobs(documents);

  console.log("Reindex status:", { reset, indexed, indexedCount: documents.length });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
