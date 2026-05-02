import { MeiliSearch } from "meilisearch";

const host = process.env.MEILISEARCH_HOST;
const key = process.env.MEILISEARCH_API_KEY;

let client = null;
if (host) {
  client = new MeiliSearch({ host, apiKey: key });
}

const INDEX_NAME = "public_jobs";

export const indexPublicJobs = async (jobs) => {
  if (!client) return { skipped: true, reason: "MEILISEARCH_HOST not configured" };

  const index = client.index(INDEX_NAME);
  await index.updateFilterableAttributes([
    "country",
    "provinceCity",
    "category",
    "jobType",
    "workMode",
    "experienceLevel",
    "createdAt",
  ]);
  await index.updateSortableAttributes(["createdAt"]);
  await index.addDocuments(jobs);
  return { skipped: false, indexed: jobs.length };
};

export const searchPublicJobs = async (query, options = {}) => {
  if (!client) {
    return { hits: [], estimatedTotalHits: 0, skipped: true, reason: "MEILISEARCH_HOST not configured" };
  }

  const index = client.index(INDEX_NAME);
  return index.search(query || "", options);
};

export const resetPublicJobsIndex = async () => {
  if (!client) return { skipped: true, reason: "MEILISEARCH_HOST not configured" };
  const index = client.index(INDEX_NAME);
  await index.deleteAllDocuments();
  return { skipped: false };
};
