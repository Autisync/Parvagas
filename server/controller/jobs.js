import Job from "../models/job.js";
import Company from "../models/company.js";
import { searchPublicJobs } from "../services/searchService.js";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

const buildPublicFilter = () => ({
  visibility: "public",
  status: { $in: ["approved", "published"] },
});

export const listPublicJobs = async (req, res) => {
  const {
    keyword,
    country,
    provinceCity,
    category,
    jobType,
    workMode,
    experienceLevel,
    salary,
    datePosted,
    useSearch,
  } = req.query;

  // Pagination
  const rawPage = parseInt(req.query.page, 10);
  const rawLimit = parseInt(req.query.limit, 10);
  const page = rawPage > 0 ? rawPage : 1;
  const limit = rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  if (String(useSearch) === "true") {
    const result = await searchPublicJobs(keyword || "", {
      filter: [
        `country = \"${country || "Angola"}\"`,
        provinceCity ? `provinceCity = \"${provinceCity}\"` : null,
        category ? `category = \"${category}\"` : null,
        jobType ? `jobType = \"${jobType}\"` : null,
        workMode ? `workMode = \"${workMode}\"` : null,
        experienceLevel ? `experienceLevel = \"${experienceLevel}\"` : null,
      ].filter(Boolean),
      sort: ["createdAt:desc"],
      limit,
      offset: skip,
    });

    const jobs = result.hits || result.jobs || [];
    const total = result.estimatedTotalHits || result.totalHits || result.total || jobs.length;
    return res.status(200).json({
      ...result,
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  }

  const query = {
    ...buildPublicFilter(),
    ...(keyword ? { $text: { $search: keyword } } : {}),
    ...(country ? { country } : {}),
    ...(provinceCity ? { provinceCity } : {}),
    ...(category ? { category } : {}),
    ...(jobType ? { jobType } : {}),
    ...(workMode ? { workMode } : {}),
    ...(experienceLevel ? { experienceLevel } : {}),
    ...(salary ? { salaryRange: new RegExp(salary, "i") } : {}),
  };

  if (datePosted) {
    const days = Number(datePosted);
    if (!Number.isNaN(days) && days > 0) {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      query.createdAt = { $gte: cutoff };
    }
  }

  const total = await Job.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  const jobs = await Job.find(query)
    .populate("companyId")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return res.status(200).json({
    jobs,
    page,
    limit,
    total,
    totalPages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(totalPages, 1),
    },
  });
};

export const getPublicJobDetail = async (req, res) => {
  const results = await Job.find({ _id: req.params.id, ...buildPublicFilter() })
    .populate("companyId")
    .limit(1);
  const job = results[0] || null;
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });
  return res.status(200).json({ job });
};

export const listPublicCompanies = async (req, res) => {
  const companies = await Company.find({ status: "active" }).sort({ createdAt: -1 });
  if (companies.length === 0) {
    const legacyCompanies = await Company.find({ verificationStatus: "verified" }).sort({ createdAt: -1 });
    return res.status(200).json({ companies: legacyCompanies });
  }
  return res.status(200).json({ companies });
};
