import CandidateProfile from "../models/candidateProfile.js";
import CandidateDocument from "../models/candidateDocument.js";
import User from "../models/user.js";
import Job from "../models/job.js";
import SavedJob from "../models/savedJob.js";
import Application from "../models/application.js";
import AIParseRun from "../models/aiParseRun.js";
import JobMatchScore from "../models/jobMatchScore.js";
import JobAlert from "../models/jobAlert.js";
import NotificationPreference from "../models/notificationPreference.js";
import GeneratedCvProfile from "../models/generatedCvProfile.js";
import storageService from "../services/storageService.js";
import { isSupportedCvFile } from "../services/cvTextExtractorService.js";
import {
  parseCvToProfile,
  generateApplicationSummaryDraft,
  generateFieldSpecificCvProfile,
  generateProfessionalSummaryDraft,
} from "../services/aiService.js";
import { calculateJobMatch, calculateProfileCompletion } from "../services/matchingService.js";
import { logAudit } from "../services/auditService.js";

const PROFILE_REQUIRED_STRING_FIELDS = [
  "fullName",
  "email",
  "phone",
  "location",
  "professionalTitle",
  "summary",
  "preferredJobType",
  "availability",
];

const ALLOWED_PREFERRED_JOB_TYPES = [
  "tempo_integral",
  "meio_periodo",
  "contrato",
  "temporario",
  "freelancer",
  "estagio",
  "remoto",
  "hibrido",
  "presencial",
];

const ALLOWED_AVAILABILITY = [
  "imediata",
  "1_semana",
  "2_semanas",
  "1_mes",
  "2_meses",
  "a_combinar",
];

const ALLOWED_ALERT_FREQUENCIES = ["immediate", "daily", "weekly"];
const ALLOWED_TARGET_FIELDS = [
  "Customer Support",
  "IT Helpdesk",
  "Frontend Developer",
  "Administration",
  "Sales",
  "Healthcare",
  "Construction",
  "Hospitality",
];

const isGeneratedCvProfilesTableMissing = (error) => {
  const message = String(error?.message || "");
  return message.includes("public.generated_cv_profiles") && message.includes("schema cache");
};

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readPagination = (req, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, defaultLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const normalizeProfilePayload = (input = {}) => {
  const payload = { ...input };
  const trim = (value) => String(value || "").trim();
  const cleanArray = (value) =>
    Array.from(
      new Set(
        (Array.isArray(value) ? value : [])
          .map((item) => String(item || "").trim().replace(/\s+/g, " "))
          .filter((item) => item.length >= 2)
      )
    );
  const normalizeExperienceItem = (item) => ({
    jobTitle: trim(item.jobTitle || item.title || item.role),
    company: trim(item.company),
    location: trim(item.location),
    startDate: trim(item.startDate),
    endDate: trim(item.endDate),
    current: Boolean(item.current || !trim(item.endDate) || trim(item.endDate).toLowerCase() === "present"),
    description: trim(item.description || item.achievement),
  });
  const normalizeEducationItem = (item) => ({
    degree: trim(item.degree || item.course),
    institution: trim(item.institution || item.school),
    location: trim(item.location),
    startDate: trim(item.startDate),
    endDate: trim(item.endDate),
    description: trim(item.description),
  });
  const cleanRichArray = (value, normalizer) =>
    (Array.isArray(value) ? value : [])
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return normalizer(item);
      })
      .filter(Boolean);
  const normalizeSalary = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const digits = String(value).replace(/[^\d]/g, "");
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  payload.fullName = trim(payload.fullName);
  payload.email = trim(payload.email).toLowerCase();
  payload.phone = trim(payload.phone);
  payload.location = trim(payload.location);
  payload.professionalTitle = trim(payload.professionalTitle);
  payload.summary = trim(payload.summary);
  payload.professionalSummary = trim(payload.professionalSummary || payload.summary);
  payload.bio = trim(payload.bio || payload.summary);
  payload.preferredJobType = trim(payload.preferredJobType);
  payload.expectedSalaryAoa = normalizeSalary(payload.expectedSalaryAoa ?? payload.salaryExpectation);
  delete payload.salaryExpectation;
  payload.availability = trim(payload.availability);
  payload.skills = cleanArray(payload.skills).filter((item) => item.length <= 40);
  payload.languages = cleanArray(payload.languages);
  payload.certifications = cleanArray(payload.certifications).filter((item) => item.length <= 80);
  payload.portfolioLinks = cleanArray(payload.portfolioLinks);
  payload.experience = cleanRichArray(payload.experience, normalizeExperienceItem);
  payload.education = cleanRichArray(payload.education, normalizeEducationItem);
  payload.preferredRoles = cleanArray(payload.preferredRoles);
  payload.preferredLocations = cleanArray(payload.preferredLocations);
  delete payload.profilePhotoUrl;
  delete payload.profilePhotoUpdatedAt;
  return payload;
};

const validateProfilePayload = (payload = {}) => {
  const errors = [];
  for (const field of PROFILE_REQUIRED_STRING_FIELDS) {
    if (!String(payload[field] || "").trim()) {
      errors.push({ field, message: `Campo obrigatório: ${field}` });
    }
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push({ field: "email", message: "Introduza um email válido." });
  }

  if (payload.phone && !/^\+?[\d\s()\-]{7,20}$/.test(payload.phone)) {
    errors.push({ field: "phone", message: "Telefone inválido." });
  }

  if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
    errors.push({ field: "skills", message: "Adicione pelo menos uma skill." });
  }

  if (!ALLOWED_PREFERRED_JOB_TYPES.includes(payload.preferredJobType)) {
    errors.push({ field: "preferredJobType", message: "Selecione um tipo de trabalho válido." });
  }

  if (!ALLOWED_AVAILABILITY.includes(payload.availability)) {
    errors.push({ field: "availability", message: "Selecione uma disponibilidade válida." });
  }

  if (payload.expectedSalaryAoa !== null && (!Number.isInteger(payload.expectedSalaryAoa) || payload.expectedSalaryAoa < 0)) {
    errors.push({ field: "expectedSalaryAoa", message: "Introduza um valor salarial válido em Kwanza." });
  }

  for (const skill of payload.skills || []) {
    if (String(skill).trim().length < 2 || String(skill).trim().length > 40) {
      errors.push({ field: "skills", message: "Cada skill deve ter entre 2 e 40 caracteres." });
      break;
    }
  }

  const hasValidExperience = (payload.experience || []).every((item) => {
    if (!item.jobTitle || !item.company || !item.startDate) return false;
    if (!item.current && !item.endDate) return false;
    if (item.endDate && item.startDate && item.endDate < item.startDate) return false;
    return true;
  });
  if (!hasValidExperience) {
    errors.push({ field: "experience", message: "Verifique os dados das experiências profissionais." });
  }

  const hasValidEducation = (payload.education || []).every((item) => {
    if (!item.degree || !item.institution || !item.startDate || !item.endDate) return false;
    if (item.endDate < item.startDate) return false;
    return true;
  });
  if (!hasValidEducation) {
    errors.push({ field: "education", message: "Verifique os dados da educação." });
  }

  return errors;
};

/**
 * Soft validation used for partial profile updates (PATCH).
 * Validates format/integrity of provided fields only — does NOT require presence of any field.
 */
const validateProfileFormatOnly = (payload = {}) => {
  const errors = [];

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push({ field: "email", message: "Introduza um email válido." });
  }

  if (payload.phone && !/^\+?[\d\s()\-]{7,20}$/.test(payload.phone)) {
    errors.push({ field: "phone", message: "Telefone inválido." });
  }

  if (payload.preferredJobType && !ALLOWED_PREFERRED_JOB_TYPES.includes(payload.preferredJobType)) {
    errors.push({ field: "preferredJobType", message: "Selecione um tipo de trabalho válido." });
  }

  if (payload.availability && !ALLOWED_AVAILABILITY.includes(payload.availability)) {
    errors.push({ field: "availability", message: "Selecione uma disponibilidade válida." });
  }

  if (
    payload.expectedSalaryAoa !== null &&
    payload.expectedSalaryAoa !== undefined &&
    (!Number.isInteger(payload.expectedSalaryAoa) || payload.expectedSalaryAoa < 0)
  ) {
    errors.push({ field: "expectedSalaryAoa", message: "Introduza um valor salarial válido em Kwanza." });
  }

  for (const skill of payload.skills || []) {
    if (String(skill).trim().length < 2 || String(skill).trim().length > 40) {
      errors.push({ field: "skills", message: "Cada skill deve ter entre 2 e 40 caracteres." });
      break;
    }
  }

  if ((payload.experience || []).length > 0) {
    const hasValidExperience = (payload.experience || []).every((item) => {
      if (!item.jobTitle || !item.company || !item.startDate) return false;
      if (!item.current && !item.endDate) return false;
      if (item.endDate && item.startDate && item.endDate < item.startDate) return false;
      return true;
    });
    if (!hasValidExperience) {
      errors.push({ field: "experience", message: "Verifique os dados das experiências profissionais." });
    }
  }

  if ((payload.education || []).length > 0) {
    const hasValidEducation = (payload.education || []).every((item) => {
      if (!item.degree || !item.institution || !item.startDate || !item.endDate) return false;
      if (item.endDate < item.startDate) return false;
      return true;
    });
    if (!hasValidEducation) {
      errors.push({ field: "education", message: "Verifique os dados da educação." });
    }
  }

  return errors;
};

const sanitizeProfileResponse = (profile) => {
  if (!profile) return profile;
  const source = typeof profile.toObject === "function" ? profile.toObject() : { ...profile };
  const normalized = normalizeProfilePayload(source);
  return {
    ...source,
    ...normalized,
    summary: normalized.summary || source.summary || source.professionalSummary || "",
    professionalSummary: normalized.professionalSummary || normalized.summary || source.professionalSummary || "",
  };
};

export const uploadCvAndParse = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "CV é obrigatório." });
    }

    if (!isSupportedCvFile(file)) {
      return res.status(400).json({ error: "Formato inválido. Use PDF ou DOCX." });
    }

    const parseRun = await AIParseRun.create({
      userId: req.user.id,
      status: "started",
      provider: process.env.RESUME_PARSER_PROVIDER || "skima",
    });

    let parsed;
    try {
      parsed = await parseCvToProfile(file);
    } catch (parseError) {
      parseRun.status = "error";
      console.error("[cv-parser-error]", { error: parseError.message, fileName: file.originalname });
      await parseRun.save().catch(() => {});
      return res.status(200).json({
        parseRunId: parseRun._id,
        documentId: null,
        aiProvider: "none",
        profileDraft: null,
        missingFields: [],
        requiresCandidateApproval: false,
        parserError: "CV não pôde ser processado automaticamente. Por favor, preencha os dados manualmente.",
      });
    }

    // Persist file to temporary storage. CandidateDocument is only created on approval.
    const storageResult = await storageService.uploadBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      folder: "pending-cvs",
    });

    parseRun.status = "parsed";
    parseRun.parsedProfile = parsed.profile;
    parseRun.pendingStoragePath = storageResult.storagePath;
    parseRun.pendingFileName = file.originalname;
    parseRun.pendingMimeType = file.mimetype;
    parseRun.pendingSizeBytes = file.size || 0;
    await parseRun.save();

    const completionScore = calculateProfileCompletion(parsed.profile);

    return res.status(200).json({
      parseRunId: parseRun._id,
      documentId: null,
      aiProvider: parsed.provider,
      profileDraft: {
        ...sanitizeProfileResponse(parsed.profile),
        completionScore,
      },
      missingFields: parsed.missingFields,
      requiresCandidateApproval: true,
      fallbackUsed: parsed.fallbackUsed ?? false,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const approveAndSaveProfile = async (req, res) => {
  try {
    const { profileDraft, parseRunId, consentGiven } = req.body;

    if (!consentGiven) {
      return res.status(400).json({ error: "Consentimento para processamento de CV/IA é obrigatório." });
    }

    if (!profileDraft) {
      return res.status(400).json({ error: "profileDraft é obrigatório." });
    }

    const normalizedDraft = normalizeProfilePayload(profileDraft);
    // Allow saving partially parsed AI drafts; block only malformed data.
    const errors = validateProfileFormatOnly(normalizedDraft);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Perfil inválido.", fieldErrors: errors });
    }

    let parseRun = null;
    if (parseRunId) {
      parseRun = await AIParseRun.findById(parseRunId);
      if (parseRun && String(parseRun.userId) !== String(req.user.id)) {
        return res.status(403).json({ error: "parseRun inválido para este utilizador." });
      }
    }

    let documentId = parseRun?.documentId || null;
    if (!documentId && parseRun?.pendingStoragePath) {
      const doc = await CandidateDocument.create({
        userId: req.user.id,
        type: "cv",
        fileName: parseRun.pendingFileName || "cv-upload",
        mimeType: parseRun.pendingMimeType || "application/octet-stream",
        storagePath: parseRun.pendingStoragePath,
        sizeBytes: Number(parseRun.pendingSizeBytes || 0),
      });
      documentId = doc._id;
    }

    const completionScore = calculateProfileCompletion(normalizedDraft);
    const profile = await CandidateProfile.findOneAndUpdate(
      { userId: req.user.id },
      {
        ...normalizedDraft,
        userId: req.user.id,
        completionScore,
        consentGiven: true,
        aiSuggestionApproved: true,
      },
      { new: true, upsert: true }
    );

    if (parseRunId && parseRun) {
      parseRun.status = "success";
      if (documentId) parseRun.documentId = documentId;
      delete parseRun.pendingStoragePath;
      delete parseRun.pendingFileName;
      delete parseRun.pendingMimeType;
      delete parseRun.pendingSizeBytes;
      await parseRun.save();
    }

    await logAudit({
      actorUserId: req.user.id,
      action: "candidate.profile.approved",
      resourceType: "CandidateProfile",
      resourceId: String(profile._id),
    });

    return res.status(200).json({ profile: sanitizeProfileResponse(profile) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getMyProfile = async (req, res) => {
  let profile = await CandidateProfile.findOne({ userId: req.user.id });
  if (!profile) {
    profile = await CandidateProfile.findOneAndUpdate(
      { userId: req.user.id },
      {
        userId: req.user.id,
        fullName: "",
        email: "",
        phone: "",
        location: "",
        professionalTitle: "",
        summary: "",
        professionalSummary: "",
        preferredJobType: "",
        availability: "",
        expectedSalaryAoa: null,
        skills: [],
        languages: [],
        certifications: [],
        experience: [],
        education: [],
      },
      { new: true, upsert: true }
    );
  }
  const documents = await CandidateDocument.find({ userId: req.user.id, type: "cv" })
    .sort({ createdAt: -1 })
    .limit(5);
  const latestCvDocument = documents[0] || null;
  const sanitized = sanitizeProfileResponse(profile);
  // Expose cvUploaded flag and cvFilePath based on stored documents
  const profileWithCvFlags = sanitized
    ? {
        ...sanitized,
        cvUploaded: Boolean(latestCvDocument),
        cvFilePath: latestCvDocument?.storagePath || null,
        cvUrl: latestCvDocument?.signedUrl || null,
      }
    : null;
  return res.status(200).json({ profile: profileWithCvFlags, latestCvDocument });
};

export const updateMyProfile = async (req, res) => {
  // Merge incoming partial data with existing profile so partial saves don't wipe stored fields
  const existing = await CandidateProfile.findOne({ userId: req.user.id });
  const existingData = existing
    ? (typeof existing.toObject === "function" ? existing.toObject() : { ...existing })
    : {};
  const merged = { ...existingData, ...req.body, userId: req.user.id };
  const profileDraft = normalizeProfilePayload(merged);

  // Soft validation — only format/integrity errors, no required-field blocking
  const validationErrors = validateProfileFormatOnly(profileDraft);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: "Perfil inválido.", fieldErrors: validationErrors });
  }

  const completionScore = calculateProfileCompletion(profileDraft);

  const requiredFields = ["fullName", "email", "phone", "location", "professionalTitle", "summary", "preferredJobType", "availability"];
  const isPartial =
    requiredFields.some((f) => !String(profileDraft[f] || "").trim()) ||
    !Array.isArray(profileDraft.skills) ||
    profileDraft.skills.length === 0;

  const profile = await CandidateProfile.findOneAndUpdate(
    { userId: req.user.id },
    {
      ...profileDraft,
      completionScore,
    },
    { new: true, upsert: true }
  );

  await logAudit({
    actorUserId: req.user.id,
    action: "candidate.profile.updated",
    resourceType: "CandidateProfile",
    resourceId: String(profile._id),
  });

  return res.status(200).json({ profile: sanitizeProfileResponse(profile), completionScore, isPartial });
};

export const createProfileSummaryDraft = async (req, res) => {
  try {
    const profile = normalizeProfilePayload(req.body.profile || req.body || {});
    const result = await generateProfessionalSummaryDraft(profile);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Não foi possível gerar o resumo neste momento." });
  }
};

/**
 * PATCH /candidates/onboarding/complete
 * Marks the authenticated candidate's onboarding as done.
 * Accepts an optional final profile snapshot to save alongside the flag.
 */
export const completeOnboarding = async (req, res) => {
  try {
    // Optionally persist final profile data in the same request
    if (req.body && Object.keys(req.body).length > 0) {
      const existing = await CandidateProfile.findOne({ userId: req.user.id });
      const existingData = existing
        ? (typeof existing.toObject === "function" ? existing.toObject() : { ...existing })
        : {};
      const merged = { ...existingData, ...req.body, userId: req.user.id };
      const profileDraft = normalizeProfilePayload(merged);
      const completionScore = calculateProfileCompletion(profileDraft);
      await CandidateProfile.findOneAndUpdate(
        { userId: req.user.id },
        { ...profileDraft, completionScore },
        { new: true, upsert: true }
      );
    }

    await User.findByIdAndUpdate(req.user.id, { hasCompletedOnboarding: true }, { new: true });

    await logAudit({
      actorUserId: req.user.id,
      action: "candidate.onboarding.completed",
      resourceType: "User",
      resourceId: String(req.user.id),
    });

    return res.status(200).json({ hasCompletedOnboarding: true, message: "Onboarding concluído." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const markTutorialSeen = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { hasSeenTutorial: true }, { new: true });
    return res.status(200).json({ hasSeenTutorial: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getRecommendedJobs = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 10, maxLimit: 30 });
  const profile = await CandidateProfile.findOne({ userId: req.user.id });
  if (!profile) return res.status(404).json({ error: "Perfil não encontrado." });

  const jobs = await Job.find({ visibility: "public", status: { $in: ["approved", "published"] } }).limit(100);

  const scored = await Promise.all(
    jobs.map(async (job) => {
      const { score, explanation } = calculateJobMatch({ profile, job });
      await JobMatchScore.findOneAndUpdate(
        { candidateUserId: req.user.id, jobId: job._id },
        {
          candidateUserId: req.user.id,
          jobId: job._id,
          score,
          explanation,
          source: "calculated",
        },
        { upsert: true, new: true }
      );

      return {
        ...(typeof job.toObject === "function" ? job.toObject() : job),
        job,
        matchScore: score,
        matchExplanation: explanation,
      };
    })
  );

  scored.sort((a, b) => b.matchScore - a.matchScore);
  const total = scored.length;
  const paged = scored.slice(skip, skip + limit);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return res.status(200).json({
    jobs: paged,
    pagination: { page, limit, total, totalPages },
  });
};

export const saveJob = async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: "jobId é obrigatório." });

  const job = await Job.findById(jobId);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });
  if (job.visibility !== "public" || !["approved", "published"].includes(String(job.status || ""))) {
    return res.status(400).json({ error: "Apenas vagas públicas e aprovadas podem ser guardadas." });
  }

  const existing = await SavedJob.findOne({ userId: req.user.id, jobId });
  if (existing) {
    return res.status(409).json({ message: "Vaga já guardada." });
  }

  await SavedJob.create({ userId: req.user.id, jobId });
  return res.status(200).json({ message: "Vaga guardada." });
};

export const getSavedJobs = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 10, maxLimit: 50 });
  const records = await SavedJob.find({ userId: req.user.id }).sort({ createdAt: -1 });
  const total = records.length;
  const paged = records.slice(skip, skip + limit);
  const jobs = await Promise.all(
    paged.map(async (record) => {
      const job = await Job.findById(String(record.jobId));
      if (!job) return null;
      return {
        _id: record._id,
        job,
        jobId: record.jobId,
        dateSaved: record.createdAt,
        status: "saved",
      };
    })
  );

  return res.status(200).json({
    jobs: jobs.filter(Boolean),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
};

export const unsaveJob = async (req, res) => {
  const jobId = req.params.id;
  const existing = await SavedJob.findOne({ userId: req.user.id, jobId });
  if (!existing) return res.status(404).json({ error: "Vaga guardada não encontrada." });
  await SavedJob.findByIdAndDelete(existing._id);
  return res.status(200).json({ message: "Vaga removida dos guardados." });
};

export const applyToJob = async (req, res) => {
  const {
    jobId,
    aiSummaryDraft,
    aiSummaryApproved,
    profileSource = "main_profile",
    generatedCvProfileId,
    useLatestCv = false,
    savedCvDocumentId,
    coverLetter = "",
  } = req.body;
  const customCv = req.file;

  const profile = await CandidateProfile.findOne({ userId: req.user.id });
  if (!profile) return res.status(400).json({ error: "Perfil obrigatório para candidatura." });

  if (aiSummaryDraft && !aiSummaryApproved) {
    return res.status(400).json({ error: "Conteúdo IA deve ser aprovado antes da submissão." });
  }

  const job = await Job.findById(jobId);
  if (!job || job.visibility !== "public" || !["approved", "published"].includes(String(job.status || ""))) {
    return res.status(404).json({ error: "Vaga pública não encontrada." });
  }

  const duplicate = await Application.findOne({
    candidateUserId: req.user.id,
    jobId,
    status: { $ne: "withdrawn" },
  });
  if (duplicate) {
    return res.status(409).json({ error: "Já existe candidatura activa para esta vaga." });
  }

  let resolvedProfile = profile;
  let selectedGeneratedProfile = null;
  if (profileSource === "generated_cv_profile") {
    if (!generatedCvProfileId) {
      return res.status(400).json({ error: "generatedCvProfileId é obrigatório quando profileSource é generated_cv_profile." });
    }
    selectedGeneratedProfile = await GeneratedCvProfile.findById(generatedCvProfileId);
    if (!selectedGeneratedProfile || String(selectedGeneratedProfile.userId) !== String(req.user.id)) {
      return res.status(404).json({ error: "Perfil CV gerado não encontrado." });
    }
    resolvedProfile = {
      ...profile,
      professionalTitle: selectedGeneratedProfile.professionalSummary || profile.professionalTitle,
      summary: selectedGeneratedProfile.professionalSummary || profile.summary,
      skills: selectedGeneratedProfile.keySkills || profile.skills,
    };
  }

  let customCvDocumentId = null;
  if (customCv) {
    if (!isSupportedCvFile(customCv)) {
      return res.status(400).json({ error: "CV personalizado deve ser PDF ou DOCX." });
    }

    const storageResult = await storageService.uploadBuffer({
      buffer: customCv.buffer,
      fileName: customCv.originalname,
    });

    const document = await CandidateDocument.create({
      userId: req.user.id,
      type: "application_cv",
      fileName: customCv.originalname,
      mimeType: customCv.mimetype,
      storagePath: storageResult.storagePath,
      sizeBytes: customCv.size || 0,
    });

    customCvDocumentId = document._id;
  } else if (savedCvDocumentId) {
    const selectedCv = await CandidateDocument.findById(savedCvDocumentId);
    if (!selectedCv || selectedCv.type !== "cv" || String(selectedCv.userId) !== String(req.user.id)) {
      return res.status(404).json({ error: "CV guardado selecionado não foi encontrado." });
    }
    customCvDocumentId = selectedCv._id;
  } else if (useLatestCv) {
    const latestCv = await CandidateDocument.find({ userId: req.user.id, type: "cv" })
      .sort({ createdAt: -1 })
      .limit(1);
    customCvDocumentId = latestCv[0]?._id || null;
  }

  const { score, explanation } = calculateJobMatch({ profile: resolvedProfile, job });
  const generatedSummary = aiSummaryDraft || (await generateApplicationSummaryDraft({ profile: resolvedProfile, job }));
  const effectiveCoverLetter = String(coverLetter || "").trim();

  const application = await Application.create({
    jobId: job._id,
    companyId: job.companyId,
    candidateUserId: req.user.id,
    profileSnapshot: resolvedProfile,
    profileSource,
    generatedCvProfileId: selectedGeneratedProfile?._id || null,
    customCvDocumentId,
    status: "submitted",
    aiSummaryDraft: generatedSummary,
    aiSummaryApproved: Boolean(aiSummaryApproved || !aiSummaryDraft),
    aiExplanation: explanation,
    matchScore: score,
    matchExplanation: explanation,
    coverLetter: effectiveCoverLetter,
    statusHistory: [
      {
        status: "submitted",
        changedBy: req.user.id,
        note: "Candidatura submetida.",
        changedAt: new Date(),
      },
    ],
  });

  return res.status(201).json({ application });
};

export const getMyApplications = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 10, maxLimit: 50 });
  const all = await Application.find({ candidateUserId: req.user.id })
    .populate("jobId")
    .sort({ updatedAt: -1 });
  const total = all.length;
  const applications = all.slice(skip, skip + limit);
  return res.status(200).json({
    applications,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
};

export const createJobAlert = async (req, res) => {
  const payload = {
    userId: req.user.id,
    keyword: String(req.body.keyword || "").trim(),
    category: String(req.body.category || "").trim(),
    location: String(req.body.location || "").trim(),
    jobType: String(req.body.jobType || "").trim(),
    salaryRange: String(req.body.salaryRange || "").trim(),
    frequency: String(req.body.frequency || "daily").trim().toLowerCase(),
    active: true,
  };

  if (!ALLOWED_ALERT_FREQUENCIES.includes(payload.frequency)) {
    return res.status(400).json({ error: "Frequência inválida." });
  }

  if (!payload.keyword && !payload.category && !payload.location && !payload.jobType) {
    return res.status(400).json({ error: "Defina pelo menos keyword, categoria, localização ou tipo de trabalho." });
  }

  const duplicate = await JobAlert.findOne({
    userId: req.user.id,
    keyword: payload.keyword,
    category: payload.category,
    location: payload.location,
    jobType: payload.jobType,
    salaryRange: payload.salaryRange,
    frequency: payload.frequency,
    active: true,
  });
  if (duplicate) {
    return res.status(409).json({ error: "Já existe um alerta ativo com os mesmos critérios." });
  }

  const alert = await JobAlert.create({
    ...payload,
  });
  return res.status(201).json({ alert });
};

export const getJobAlerts = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 10, maxLimit: 50 });
  const all = await JobAlert.find({ userId: req.user.id }).sort({ createdAt: -1 });
  const total = all.length;
  const alerts = all.slice(skip, skip + limit);
  return res.status(200).json({
    alerts,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
};

export const deleteJobAlert = async (req, res) => {
  const alert = await JobAlert.findById(req.params.id);
  if (!alert) return res.status(404).json({ error: "Alerta não encontrado." });
  if (String(alert.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: "Sem permissão para eliminar este alerta." });
  }

  await JobAlert.findByIdAndDelete(req.params.id);
  return res.status(200).json({ message: "Alerta eliminado." });
};

export const updateJobAlert = async (req, res) => {
  const existing = await JobAlert.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Alerta não encontrado." });
  if (String(existing.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: "Sem permissão para editar este alerta." });
  }

  const patch = {
    keyword: String(req.body.keyword ?? existing.keyword ?? "").trim(),
    category: String(req.body.category ?? existing.category ?? "").trim(),
    location: String(req.body.location ?? existing.location ?? "").trim(),
    jobType: String(req.body.jobType ?? existing.jobType ?? "").trim(),
    salaryRange: String(req.body.salaryRange ?? existing.salaryRange ?? "").trim(),
    frequency: String(req.body.frequency ?? existing.frequency ?? "daily").trim().toLowerCase(),
    active: req.body.active === undefined ? Boolean(existing.active ?? true) : Boolean(req.body.active),
  };

  if (!ALLOWED_ALERT_FREQUENCIES.includes(patch.frequency)) {
    return res.status(400).json({ error: "Frequência inválida." });
  }

  const duplicate = await JobAlert.findOne({
    userId: req.user.id,
    keyword: patch.keyword,
    category: patch.category,
    location: patch.location,
    jobType: patch.jobType,
    salaryRange: patch.salaryRange,
    frequency: patch.frequency,
    active: patch.active,
  });
  if (duplicate && String(duplicate._id) !== String(existing._id)) {
    return res.status(409).json({ error: "Já existe outro alerta com os mesmos critérios." });
  }

  const alert = await JobAlert.findByIdAndUpdate(existing._id, patch, { new: true });
  return res.status(200).json({ alert });
};

export const updateNotificationPreferences = async (req, res) => {
  const payload = {
    emailJobAlerts: Boolean(req.body.emailJobAlerts),
    applicationStatusUpdates: Boolean(req.body.applicationStatusUpdates),
    savedJobReminders: Boolean(req.body.savedJobReminders),
    recommendationUpdates: Boolean(req.body.recommendationUpdates),
    marketingNewsletter: Boolean(req.body.marketingNewsletter),
  };

  const preferences = await NotificationPreference.findOneAndUpdate(
    { userId: req.user.id },
    { userId: req.user.id, ...payload },
    { new: true, upsert: true }
  );

  return res.status(200).json({ preferences });
};

export const getNotificationPreferences = async (req, res) => {
  const defaults = {
    emailJobAlerts: true,
    applicationStatusUpdates: true,
    savedJobReminders: false,
    recommendationUpdates: true,
    marketingNewsletter: false,
  };
  const found = await NotificationPreference.findOne({ userId: req.user.id });
  const preferences = found ? { ...defaults, ...found.toObject?.(), ...found } : defaults;
  return res.status(200).json({ preferences });
};

export const listCvDocuments = async (req, res) => {
  const documents = await CandidateDocument.find({ userId: req.user.id, type: "cv" }).sort({ createdAt: -1 });
  const hydrated = await Promise.all(
    documents.map(async (doc) => ({
      ...doc,
      signedUrl: await storageService.getSignedUrl(doc.storagePath),
    }))
  );
  return res.status(200).json({ documents: hydrated });
};

export const deleteCvDocument = async (req, res) => {
  const id = req.params.id;
  const existing = await CandidateDocument.findById(id);
  if (!existing || existing.type !== "cv" || String(existing.userId) !== String(req.user.id)) {
    return res.status(404).json({ error: "Documento não encontrado." });
  }

  try {
    await storageService.deleteFile(existing.storagePath);
  } catch (error) {
    console.error("[cv-delete-storage-error]", { error: error.message, storagePath: existing.storagePath });
  }

  await CandidateDocument.findByIdAndDelete(existing._id);
  return res.status(200).json({ message: "Documento removido com sucesso." });
};

export const createGeneratedCvProfile = async (req, res) => {
  const profile = await CandidateProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return res.status(400).json({ error: "Complete o seu perfil antes de gerar CVs por área." });
  }

  const targetField = String(req.body.targetField || "").trim();
  const jobDescription = String(req.body.jobDescription || "").trim();
  if (!ALLOWED_TARGET_FIELDS.includes(targetField)) {
    return res.status(400).json({ error: "Área de emprego inválida." });
  }

  const generated = await generateFieldSpecificCvProfile({
    profile,
    targetField,
    jobDescription,
  });

  try {
    const record = await GeneratedCvProfile.create({
      userId: req.user.id,
      targetField,
      jobDescription,
      ...generated,
      approved: false,
    });
    return res.status(201).json({ cvProfile: record });
  } catch (err) {
    // Gracefully handle missing table (e.g., shared integration DB without latest migration)
    if (isGeneratedCvProfilesTableMissing(err)) {
      return res.status(500).json({ error: "Feature not available in this environment." });
    }
    throw err;
  }
};

export const listGeneratedCvProfiles = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 10, maxLimit: 50 });
  try {
    const all = await GeneratedCvProfile.find({ userId: req.user.id }).sort({ updatedAt: -1 });
    const total = all.length;
    const cvProfiles = all.slice(skip, skip + limit);
    return res.status(200).json({
      cvProfiles,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    if (isGeneratedCvProfilesTableMissing(err)) {
      return res.status(200).json({
        cvProfiles: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
        warning: "Feature not available in this environment.",
      });
    }
    throw err;
  }
};

export const updateGeneratedCvProfile = async (req, res) => {
  const id = req.params.id;
  const existing = await GeneratedCvProfile.findById(id);
  if (!existing || String(existing.userId) !== String(req.user.id)) {
    return res.status(404).json({ error: "Perfil CV gerado não encontrado." });
  }

  const patch = {
    professionalSummary: String(req.body.professionalSummary ?? existing.professionalSummary ?? "").trim(),
    keySkills: Array.isArray(req.body.keySkills)
      ? req.body.keySkills.map((v) => String(v).trim()).filter(Boolean)
      : existing.keySkills,
    experienceHighlights: Array.isArray(req.body.experienceHighlights)
      ? req.body.experienceHighlights.map((v) => String(v).trim()).filter(Boolean)
      : existing.experienceHighlights,
    suggestedKeywords: Array.isArray(req.body.suggestedKeywords)
      ? req.body.suggestedKeywords.map((v) => String(v).trim()).filter(Boolean)
      : existing.suggestedKeywords,
    coverLetterDraft: String(req.body.coverLetterDraft ?? existing.coverLetterDraft ?? "").trim(),
    approved: Boolean(req.body.approved),
  };

  const updated = await GeneratedCvProfile.findByIdAndUpdate(id, patch, { new: true });
  return res.status(200).json({ cvProfile: updated });
};

export const duplicateGeneratedCvProfile = async (req, res) => {
  const id = req.params.id;
  const existing = await GeneratedCvProfile.findById(id);
  if (!existing || String(existing.userId) !== String(req.user.id)) {
    return res.status(404).json({ error: "Perfil CV gerado não encontrado." });
  }

  const source = typeof existing.toObject === "function" ? existing.toObject() : { ...existing };
  const duplicated = await GeneratedCvProfile.create({
    ...source,
    _id: undefined,
    id: undefined,
    userId: req.user.id,
    approved: false,
    label: `${existing.label || existing.targetField || "CV"} (cópia)`,
  });

  return res.status(201).json({ cvProfile: duplicated });
};

export const deleteGeneratedCvProfile = async (req, res) => {
  const id = req.params.id;
  const existing = await GeneratedCvProfile.findById(id);
  if (!existing || String(existing.userId) !== String(req.user.id)) {
    return res.status(404).json({ error: "Perfil CV gerado não encontrado." });
  }

  await GeneratedCvProfile.findByIdAndDelete(id);
  return res.status(200).json({ message: "Perfil CV gerado removido." });
};
