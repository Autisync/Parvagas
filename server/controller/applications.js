import Application from "../models/application.js";
import Job from "../models/job.js";
import Company from "../models/company.js";
import CandidateProfile from "../models/candidateProfile.js";
import CandidateDocument from "../models/candidateDocument.js";
import { logAudit } from "../services/auditService.js";
import { sendEmailNotification } from "../services/notificationService.js";
import User from "../models/user.js";
import storageService from "../services/storageService.js";
import { Permissions, hasPermission } from "../services/rbacService.js";

const resolveCompanyForUser = async (user) => {
  if (user?.companyId) {
    const byMembership = await Company.findById(String(user.companyId));
    if (byMembership) return byMembership;
  }
  return Company.findOne({ ownerUserId: user.id });
};

const allowedStatuses = [
  "draft",
  "submitted",
  "under_review",
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "rejected",
  "hired",
  "withdrawn",
];

// Statuses only companies/admins can set
const hiringStatuses = ["under_review", "viewed", "shortlisted", "interview", "offer", "rejected", "hired"];
// Statuses candidates can set
const candidateAllowedStatuses = ["submitted", "withdrawn"];

export const getApplications = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  let query = {};
  if (req.user.role === "admin") {
    // Admins see all applications
  } else if (req.user.role === "company") {
    const company = await resolveCompanyForUser(req.user);
    if (company) {
      query.companyId = company._id;
    } else {
      return res.status(200).json({ applications: [], page, limit, total: 0, totalPages: 0, pagination: { page, limit, total: 0, totalPages: 0 } });
    }
  } else {
    // Candidates see only their own applications
    query.candidateUserId = req.user.id;
  }

  const total = await Application.countDocuments(query);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const applications = await Application.find(query)
    .populate("jobId")
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);

  return res.status(200).json({
    applications,
    page,
    limit,
    total,
    totalPages,
    pagination: { page, limit, total, totalPages },
  });
};

export const getApplication = async (req, res) => {
  const { id } = req.params;
  const results = await Application.find({ _id: id }).populate("jobId").limit(1);
  const application = results[0] || null;

  if (!application) return res.status(404).json({ error: "Candidatura não encontrada." });

  if (
    req.user.role !== "admin" &&
    String(application.candidateUserId) !== String(req.user.id)
  ) {
    const company = await resolveCompanyForUser(req.user);
    if (!company || String(application.companyId) !== String(company._id)) {
      return res.status(403).json({ error: "Sem permissão para esta candidatura." });
    }
  }

  return res.status(200).json({ application });
};

export const createApplication = async (req, res) => {
  const { jobId, profileSnapshot } = req.body;
  if (!jobId || !profileSnapshot) {
    return res.status(400).json({ error: "jobId e profileSnapshot são obrigatórios." });
  }

  const job = await Job.findById(jobId);
  if (!job || job.visibility !== "public" || !["approved", "published"].includes(String(job.status || ""))) {
    return res.status(400).json({ error: "Apenas vagas públicas aprovadas podem receber candidaturas." });
  }

  // Prevent duplicate active applications
  const duplicate = await Application.findOne({
    candidateUserId: req.user.id,
    jobId,
    status: { $ne: "withdrawn" },
  });
  if (duplicate) {
    return res.status(409).json({ error: "Já tem uma candidatura activa para esta vaga." });
  }

  const application = await Application.create({
    jobId,
    companyId: job.companyId,
    candidateUserId: req.user.id,
    profileSnapshot,
    status: "submitted",
    statusHistory: [{ status: "submitted", changedBy: req.user.id, changedAt: new Date().toISOString() }],
  });

  await logAudit({
    actorUserId: req.user.id,
    action: "application.create",
    resourceType: "Application",
    resourceId: String(application._id),
    details: { jobId },
  });

  // Notify company
  try {
    const company = await Company.findById(String(job.companyId));
    const companyOwner = company?.ownerUserId ? await User.findById(String(company.ownerUserId)) : null;
    const recipient = company?.contactEmail || companyOwner?.email;
    if (recipient) {
      await sendEmailNotification({
        userId: String(company?.ownerUserId || job.companyId),
        toEmail: recipient,
        subject: `Nova candidatura para ${job.title}`,
        body: `Recebeu uma nova candidatura para a vaga "${job.title}". Aceda ao portal para rever.`,
      });
    }
  } catch (_) { /* notification failure is non-blocking */ }

  return res.status(201).json({ application, message: "Candidatura submetida." });
};

export const updateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Estado inválido." });
  }

  const results = await Application.find({ _id: id }).populate("jobId").limit(1);
  const application = results[0] || null;
  if (!application) return res.status(404).json({ error: "Candidatura não encontrada." });

  // Candidates can only set candidate-allowed statuses
  if (req.user.role === "candidate") {
    if (String(application.candidateUserId) !== String(req.user.id)) {
      return res.status(403).json({ error: "Sem permissão." });
    }
    if (!candidateAllowedStatuses.includes(status)) {
      return res.status(403).json({ error: "Candidatos apenas podem submeter ou retirar candidaturas." });
    }
  }

  if (req.user.role === "company") {
    const teamRole = String(req.user.companyTeamRole || "recruiter").toLowerCase();
    if (teamRole === "viewer") {
      return res.status(403).json({ error: "Perfil viewer não pode alterar estado de candidaturas." });
    }

    const company = await resolveCompanyForUser(req.user);
    if (!company || String(application.companyId) !== String(company._id)) {
      return res.status(403).json({ error: "Sem permissão." });
    }
    if (!hiringStatuses.includes(status)) {
      return res.status(400).json({ error: "Estado de recrutamento inválido para empresa." });
    }
  }

  application.status = status;
  application.statusHistory.push({
    status,
    changedBy: req.user.id,
    note: note || "",
    changedAt: new Date().toISOString(),
  });

  await application.save();

  await logAudit({
    actorUserId: req.user.id,
    action: "application.status.update",
    resourceType: "Application",
    resourceId: String(application._id),
    details: { status },
  });

  // Notify candidate of status change if company/admin updated
  if (req.user.role !== "candidate") {
    try {
      const candidate = await User.findById(String(application.candidateUserId));
      if (candidate) {
        await sendEmailNotification({
          userId: String(application.candidateUserId),
          toEmail: candidate.email,
          subject: `Actualização da sua candidatura`,
          body: `O estado da sua candidatura foi actualizado para: ${status}.`,
        });
      }
    } catch (_) { /* non-blocking */ }
  }

  return res.status(200).json({ application, message: "Estado atualizado." });
};

export const deleteApplication = async (req, res) => {
  const { id } = req.params;

  // Fetch first to check ownership
  const application = await Application.findById(id);
  if (!application) {
    return res.status(404).json({ error: "Candidatura não encontrada." });
  }

  if (
    req.user.role !== "admin" &&
    String(application.candidateUserId) !== String(req.user.id)
  ) {
    return res.status(403).json({ error: "Sem permissão." });
  }

  await Application.findByIdAndDelete(id);
  return res.status(200).json({ message: "Candidatura removida." });
};

export const getApplicationCandidateCv = async (req, res) => {
  const { id } = req.params;
  const results = await Application.find({ _id: id }).limit(1);
  const application = results[0] || null;
  if (!application) return res.status(404).json({ error: "Candidatura não encontrada." });

  let accessScope = "";
  if (req.user.role === "admin") {
    if (!hasPermission(req.user, Permissions.ADMIN_CANDIDATE_CV_VIEW)) {
      return res.status(403).json({ error: "Permissão insuficiente." });
    }
    accessScope = "platform_moderator";
  } else if (req.user.role === "company") {
    const company = await resolveCompanyForUser(req.user);
    const appJobId =
      application?.jobId && typeof application.jobId === "object"
        ? (application.jobId._id || application.jobId.id || application.jobId)
        : application?.jobId;

    let ownsApplication = false;
    if (company && appJobId) {
      const jobs = await Job.find({}).select("_id companyId").limit(5000);
      const ownedJobIds = new Set(
        jobs
          .filter((job) => {
            const jobCompanyId =
              job?.companyId && typeof job.companyId === "object"
                ? (job.companyId._id || job.companyId.id || job.companyId)
                : job?.companyId;
            return String(jobCompanyId || "") === String(company._id);
          })
          .map((job) => String(job._id))
      );
      ownsApplication = ownedJobIds.has(String(appJobId));
    }

    if (!company || !ownsApplication) {
      return res.status(403).json({ error: "Sem permissão para visualizar CV desta candidatura." });
    }
    accessScope = "company_moderator";
  } else {
    return res.status(403).json({ error: "Permissão insuficiente." });
  }

  const rawCandidateUserId =
    application?.candidateUserId && typeof application.candidateUserId === "object"
      ? (application.candidateUserId._id || application.candidateUserId.id || application.candidateUserId)
      : application.candidateUserId;
  const candidateUserId = String(rawCandidateUserId || "");
  if (!candidateUserId) {
    return res.status(404).json({ error: "Candidato não encontrado para esta candidatura." });
  }

  const [candidateUser, candidateProfile, docs] = await Promise.all([
    User.findById(candidateUserId),
    CandidateProfile.findOne({ userId: candidateUserId }),
    CandidateDocument.find({ userId: candidateUserId }).sort({ createdAt: -1 }).limit(12),
  ]);

  const documents = await Promise.all(
    docs
      .filter((doc) => ["cv", "application_cv", "quick_apply_cv"].includes(String(doc.type || "")))
      .map(async (doc) => ({
        _id: doc._id,
        type: doc.type,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        createdAt: doc.createdAt,
        signedUrl: await storageService.getSignedUrl(doc.storagePath),
      }))
  );

  await logAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: "candidate.cv.view",
    resourceType: "CandidateProfile",
    resourceId: candidateUserId,
    details: {
      applicationId: id,
      companyId: String(application.companyId || ""),
      accessScope,
      documentCount: documents.length,
    },
  });

  return res.status(200).json({
    candidate: {
      userId: candidateUserId,
      fullName: candidateProfile?.fullName || candidateUser?.fullName || application?.profileSnapshot?.fullName || "",
      email: candidateProfile?.email || candidateUser?.email || application?.profileSnapshot?.email || "",
      location: candidateProfile?.location || application?.profileSnapshot?.location || "",
      professionalTitle: candidateProfile?.professionalTitle || "",
      summary: candidateProfile?.summary || "",
      skills: Array.isArray(candidateProfile?.skills)
        ? candidateProfile.skills
        : (Array.isArray(application?.profileSnapshot?.skills) ? application.profileSnapshot.skills : []),
    },
    documents,
    latestDocumentId: documents[0]?._id || null,
  });
};
