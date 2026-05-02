import { createModel } from "../db/modelFactory.js";

const SavedJob = createModel("savedJobs", "saved_jobs");
export default SavedJob;
