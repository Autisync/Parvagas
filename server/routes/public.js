import express from "express";
import multer from "multer";
import bcrypt from "bcrypt";
import AdCampaign from "../models/adCampaign.js";
import CareerPost from "../models/careerPost.js";
import Job from "../models/job.js";
import Application from "../models/application.js";
import User from "../models/user.js";
import Company from "../models/company.js";
import CandidateProfile from "../models/candidateProfile.js";
import CandidateDocument from "../models/candidateDocument.js";
import storageService from "../services/storageService.js";
import { isSupportedCvFile } from "../services/cvTextExtractorService.js";
import { sendEmailNotification } from "../services/notificationService.js";
import { logAudit } from "../services/auditService.js";
import { getOrSetCache, getStaleCachedValue } from "../services/publicCacheService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const PUBLIC_JOB_FILTER = { visibility: "public", status: "approved" };

/** Returns up to `limit` featured jobs (flagged first, falling back to recency). */
async function getFeaturedJobs(limit) {
  const featured = await Job.find({ ...PUBLIC_JOB_FILTER, featuredOnHome: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("companyId");

  if (featured.length >= limit) return featured;

  const excludedIds = new Set(featured.map((j) => j._id));
  const fallback = await Job.find(PUBLIC_JOB_FILTER)
    .sort({ createdAt: -1 })
    .limit(limit * 3)
    .populate("companyId");

  for (const job of fallback) {
    if (!excludedIds.has(job._id)) featured.push(job);
    if (featured.length >= limit) break;
  }

  return featured;
}

router.get("/ads", async (req, res) => {
  try {
    const placement = req.query.placement;
    const now = new Date().toISOString();
    const cacheKey = `public:ads:${String(placement || "all")}`;
    const ads = await getOrSetCache(cacheKey, 15000, async () => {
      return AdCampaign.find({
        active: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        ...(placement ? { placement } : {}),
      });
    });
    return res.status(200).json({ ads });
  } catch (_error) {
    const placement = req.query.placement;
    const cacheKey = `public:ads:${String(placement || "all")}`;
    const staleAds = getStaleCachedValue(cacheKey);
    if (staleAds !== null) {
      res.set("x-cache", "stale-fallback");
      res.set("retry-after", "3");
      return res.status(200).json({ ads: staleAds });
    }
    return res.status(503).json({ error: "Serviço temporariamente indisponível. Tente novamente." });
  }
});

/** Homepage feed: featured jobs + featured career post previews */
router.get("/homepage", async (req, res) => {
  const jobsLimit = Math.max(1, Math.min(Number(req.query.jobsLimit) || 6, 12));
  const postsLimit = Math.max(1, Math.min(Number(req.query.postsLimit) || 3, 6));
  const cacheKey = `public:homepage:${jobsLimit}:${postsLimit}`;

  try {
    const payload = await getOrSetCache(cacheKey, 15000, async () => {
      const [featuredJobs, featuredCareerPosts] = await Promise.all([
        getFeaturedJobs(jobsLimit),
        CareerPost.find({ status: "published", featuredOnHome: true })
          .sort({ publishedAt: -1 })
          .limit(postsLimit),
      ]);

      return { featuredJobs, featuredCareerPosts };
    });

    return res.status(200).json(payload);
  } catch (_error) {
    const stalePayload = getStaleCachedValue(cacheKey);
    if (stalePayload !== null) {
      res.set("x-cache", "stale-fallback");
      res.set("retry-after", "3");
      return res.status(200).json(stalePayload);
    }
    return res.status(503).json({ error: "Serviço temporariamente indisponível. Tente novamente." });
  }
});

/** Full career post list */
router.get("/career/posts", async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 24));
  const cacheKey = `public:career:list:${limit}`;
  try {
    const posts = await getOrSetCache(cacheKey, 15000, async () => {
      return CareerPost.find({ status: "published" })
        .sort({ publishedAt: -1 })
        .limit(limit);
    });
    return res.status(200).json({ posts });
  } catch (_error) {
    const stalePosts = getStaleCachedValue(cacheKey);
    if (stalePosts !== null) {
      res.set("x-cache", "stale-fallback");
      res.set("retry-after", "3");
      return res.status(200).json({ posts: stalePosts });
    }
    return res.status(503).json({ error: "Serviço temporariamente indisponível. Tente novamente." });
  }
});

/** Single career post by slug */
router.get("/career/posts/:slug", async (req, res) => {
  const slug = String(req.params.slug || "");
  const cacheKey = `public:career:slug:${slug}`;
  try {
    const post = await getOrSetCache(cacheKey, 15000, async () => {
      return CareerPost.findOne({ slug, status: "published" });
    });
    if (!post) return res.status(404).json({ error: "Conteúdo de carreira não encontrado." });
    return res.status(200).json({ post });
  } catch (_error) {
    const stalePost = getStaleCachedValue(cacheKey);
    if (stalePost !== null) {
      res.set("x-cache", "stale-fallback");
      res.set("retry-after", "3");
      return res.status(200).json({ post: stalePost });
    }
    return res.status(503).json({ error: "Serviço temporariamente indisponível. Tente novamente." });
  }
});

router.get("/sitemap-jobs", async (_req, res) => {
  const jobs = await Job.find(PUBLIC_JOB_FILTER).select("_id updatedAt");
  return res.status(200).json({ jobs });
});

router.post("/ads/:id/impression", async (req, res) => {
  const ad = await AdCampaign.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } }, { new: true });
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });
  return res.status(200).json({ impressions: ad.impressions });
});

router.post("/ads/:id/click", async (req, res) => {
  const ad = await AdCampaign.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } }, { new: true });
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado." });
  return res.status(200).json({ clicks: ad.clicks, link: ad.link });
});

router.post("/cv-submissions", upload.fields([{ name: "cv", maxCount: 1 }, { name: "extraDocument", maxCount: 1 }]), async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.cellphoneContact || "").trim();
    const location = String(req.body.city || req.body.residencialAddress || "").trim();
    const qualification = String(req.body.qualification || "").trim();
    const profession = String(req.body.profession || "").trim();
    const summary = String(req.body.personalStatement || "").trim();
    const cv = req.files?.cv?.[0];
    const extraDocument = req.files?.extraDocument?.[0];

    if (!fullName || !email) {
      return res.status(400).json({ error: "Nome completo e email são obrigatórios." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email inválido." });
    }
    if (!cv) {
      return res.status(400).json({ error: "Anexe o CV em PDF ou DOCX." });
    }
    if (!isSupportedCvFile(cv)) {
      return res.status(400).json({ error: "Formato inválido. Use PDF ou DOCX." });
    }

    let candidateUser = await User.findOne({ email });
    if (candidateUser && String(candidateUser.role || "") !== "candidate") {
      return res.status(409).json({ error: "Este email já está associado a outro tipo de conta." });
    }

    if (!candidateUser) {
      const generatedPassword = `Cv!${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(generatedPassword, salt);
      candidateUser = await User.create({
        fullName,
        email,
        password: passwordHash,
        role: "candidate",
        quickApplyPendingActivation: true,
        registrationSource: "spontaneous_cv",
      });
    }

    await CandidateProfile.findOneAndUpdate(
      { userId: candidateUser._id },
      {
        userId: candidateUser._id,
        fullName,
        email,
        phone,
        location,
        professionalTitle: profession,
        summary,
        professionalSummary: summary,
        preferredJobType: "tempo_integral",
        expectedSalaryAoa: null,
        availability: "a_combinar",
        skills: qualification ? [qualification] : [],
        experience: [],
        education: [],
      },
      { new: true, upsert: true }
    );

    const storedCv = await storageService.uploadBuffer({
      buffer: cv.buffer,
      fileName: cv.originalname,
      folder: "spontaneous-cv",
    });

    await CandidateDocument.create({
      userId: candidateUser._id,
      type: "cv",
      fileName: cv.originalname,
      mimeType: cv.mimetype,
      storagePath: storedCv.storagePath,
      sizeBytes: cv.size || 0,
    });

    if (extraDocument) {
      const storedExtra = await storageService.uploadBuffer({
        buffer: extraDocument.buffer,
        fileName: extraDocument.originalname,
        folder: "spontaneous-cv",
      });

      await CandidateDocument.create({
        userId: candidateUser._id,
        type: "application_cv",
        fileName: extraDocument.originalname,
        mimeType: extraDocument.mimetype,
        storagePath: storedExtra.storagePath,
        sizeBytes: extraDocument.size || 0,
      });
    }

    await sendEmailNotification({
      userId: String(candidateUser._id),
      toEmail: email,
      subject: "Recebemos o seu CV no Parvagas",
      body: "O seu CV foi recebido com sucesso. Entraremos em contacto quando houver oportunidade compatível.",
    }).catch(() => {});

    await logAudit({
      actorUserId: candidateUser._id,
      actorRole: "candidate",
      action: "candidate.spontaneousCv.submit",
      resourceType: "CandidateDocument",
      resourceId: String(candidateUser._id),
      details: {
        email,
        hasExtraDocument: Boolean(extraDocument),
      },
    });

    return res.status(201).json({
      message: "CV submetido com sucesso.",
      candidateUserId: candidateUser._id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Não foi possível submeter o CV." });
  }
});

router.post("/jobs/:id/quick-apply", upload.single("cv"), async (req, res) => {
  try {
    const { id } = req.params;
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const location = String(req.body.location || "").trim();
    const coverLetter = String(req.body.coverLetter || "").trim();
    const cv = req.file;

    if (!fullName || !email || !phone || !location) {
      return res.status(400).json({ error: "Nome, email, telefone e localização são obrigatórios." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email inválido." });
    }
    if (!cv) {
      return res.status(400).json({ error: "CV é obrigatório (PDF ou DOCX)." });
    }
    if (!isSupportedCvFile(cv)) {
      return res.status(400).json({ error: "Formato inválido. Use PDF ou DOCX." });
    }

    const job = await Job.findById(id);
    if (!job || job.visibility !== "public" || !["approved", "published"].includes(String(job.status || ""))) {
      return res.status(404).json({ error: "Vaga pública não encontrada." });
    }

    let candidateUser = await User.findOne({ email });
    if (candidateUser && String(candidateUser.role || "") !== "candidate") {
      return res.status(409).json({ error: "Este email já está associado a outro tipo de conta." });
    }

    if (!candidateUser) {
      const generatedPassword = `Qa!${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(generatedPassword, salt);
      candidateUser = await User.create({
        fullName,
        email,
        password: passwordHash,
        role: "candidate",
        quickApplyPendingActivation: true,
        registrationSource: "quick_apply",
      });
    }

    await CandidateProfile.findOneAndUpdate(
      { userId: candidateUser._id },
      {
        userId: candidateUser._id,
        fullName,
        email,
        phone,
        location,
        summary: coverLetter || "Candidatura enviada por Quick Apply.",
        professionalSummary: coverLetter || "Candidatura enviada por Quick Apply.",
        preferredJobType: "tempo_integral",
        expectedSalaryAoa: null,
        availability: "a_combinar",
        professionalTitle: "",
        skills: [],
        experience: [],
        education: [],
      },
      { new: true, upsert: true }
    );

    const duplicate = await Application.findOne({
      candidateUserId: candidateUser._id,
      jobId: job._id,
      status: { $ne: "withdrawn" },
    });
    if (duplicate) {
      return res.status(409).json({ error: "Já existe uma candidatura activa para esta vaga com este email." });
    }

    const storageResult = await storageService.uploadBuffer({
      buffer: cv.buffer,
      fileName: cv.originalname,
      folder: "quick-apply-cv",
    });

    const document = await CandidateDocument.create({
      userId: candidateUser._id,
      type: "quick_apply_cv",
      fileName: cv.originalname,
      mimeType: cv.mimetype,
      storagePath: storageResult.storagePath,
      sizeBytes: cv.size || 0,
    });

    const application = await Application.create({
      jobId: job._id,
      companyId: job.companyId,
      candidateUserId: candidateUser._id,
      profileSource: "quick_apply",
      customCvDocumentId: document._id,
      coverLetter,
      status: "submitted",
      quickApply: true,
      profileSnapshot: {
        fullName,
        email,
        phone,
        location,
        skills: [],
      },
      statusHistory: [{ status: "submitted", changedBy: candidateUser._id, changedAt: new Date().toISOString(), note: "Quick Apply" }],
    });

    try {
      const company = await Company.findById(String(job.companyId));
      const recipient = company?.contactEmail;
      if (recipient) {
        await sendEmailNotification({
          userId: String(company?.ownerUserId || job.companyId),
          toEmail: recipient,
          subject: `Nova candidatura rápida para ${job.title}`,
          body: `${fullName} submeteu candidatura rápida para a vaga \"${job.title}\".`,
        });
      }
    } catch (_) {
      // Notification delivery is non-blocking.
    }

    await sendEmailNotification({
      userId: String(candidateUser._id),
      toEmail: email,
      subject: "Recebemos a sua candidatura no Parvagas",
      body:
        "A sua candidatura foi submetida com sucesso. Para acompanhar estado, recomendamos criar/activar a sua conta no Parvagas com este email.",
    }).catch(() => {});

    await logAudit({
      actorUserId: candidateUser._id,
      actorRole: "candidate",
      action: "application.quickApply.create",
      resourceType: "Application",
      resourceId: String(application._id),
      details: {
        jobId: String(job._id),
        companyId: String(job.companyId),
        createdTempUser: Boolean(candidateUser.quickApplyPendingActivation),
      },
    });

    return res.status(201).json({
      message: "Candidatura rápida submetida com sucesso.",
      applicationId: application._id,
      candidateUserId: candidateUser._id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erro ao processar Quick Apply." });
  }
});

export default router;
