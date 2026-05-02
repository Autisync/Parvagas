import { createModel } from "../db/modelFactory.js";

const ScrapedJob = createModel("scrapedJobs", "scraped_jobs");
export default ScrapedJob;
