import Company from "../models/company.js";
import Job from "../models/job.js";
import Application from "../models/application.js";
import User from "../models/user.js";
import CompanyInvite from "../models/companyInvite.js";
import AuditLog from "../models/auditLog.js";
import { logAdminAction, logAudit } from "../services/auditService.js";
import { JobStatuses, canTransitionJobStatus, isPlatformReviewRequired } from "../services/jobWorkflowService.js";
import { normalizeAdminLevel } from "../services/rbacService.js";
import {
  findCompanyByIdentifier,
  findCompanyByNormalizedName,
  normalizeCompanyIdentifier,
} from "../services/companyUniquenessService.js";
import { companyPresenceHeartbeat, companyPresenceStatus } from "../services/presenceService.js";
import { sendEmailNotification } from "../services/notificationService.js";
import crypto from "crypto";

const dedupeIds = (items = []) => Array.from(new Set(items.map((id) => String(id))));
const COMPANY_TEAM_ROLES = new Set(["owner", "manager", "recruiter", "viewer"]);

const isCompanyOwner = (company, userId) => String(company?.ownerUserId || "") === String(userId || "");

const normalizeTeamRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  return COMPANY_TEAM_ROLES.has(role) ? role : "recruiter";
};

const getEffectiveCompanyRole = (company, user) => {
  if (!company || !user) return "viewer";
  if (isCompanyOwner(company, user.id)) return "owner";
  return normalizeTeamRole(user.companyTeamRole || user.teamRole);
};

const canApproveCompanyJobs = (company, user) => {
  if (user?.role === "admin") return true;
  const role = getEffectiveCompanyRole(company, user);
  return role === "owner" || role === "manager";
};

const ensureCompanyPermission = (req, res, neededRoles = ["owner", "manager", "recruiter"]) => {
  const role = normalizeTeamRole(req.user?.companyTeamRole);
  if (!neededRoles.includes(role)) {
    res.status(403).json({ error: "Sem permissão para esta ação no contexto da empresa." });
    return false;
  }
  return true;
};

const makeInviteToken = () => crypto.randomBytes(24).toString("hex");

const publicSiteUrl = () => {
  const cors = String(process.env.CORS_ORIGIN || "").split(",").map((v) => v.trim()).filter(Boolean)[0];
  return process.env.NEXT_PUBLIC_SITE_URL || cors || "http://localhost:3000";
};

const companyInviteEmailTemplate = ({ companyName, inviteLink, roleLabel, expiresAt }) => ({
  subject: `Convite para equipa da ${companyName || "empresa"} no Parvagas`,
  text: [
    `Recebeu um convite para integrar a equipa da ${companyName || "empresa"} no Parvagas.`,
    `Função: ${roleLabel}`,
    `Expira em: ${new Date(expiresAt).toLocaleString("pt-AO")}`,
    `Aceitar convite: ${inviteLink}`,
  ].join("\n"),
  html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">Convite de equipa no Parvagas</h2>
      <p>Recebeu um convite para integrar a equipa da <strong>${companyName || "empresa"}</strong>.</p>
      <p><strong>Função:</strong> ${roleLabel}<br/><strong>Expira em:</strong> ${new Date(expiresAt).toLocaleString("pt-AO")}</p>
      <p style="margin: 16px 0;">
        <a href="${inviteLink}" style="background:#dc2626;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Aceitar convite</a>
      </p>
      <p>Se o botão não funcionar, use este link: <br/><a href="${inviteLink}">${inviteLink}</a></p>
    </div>
  `,
});

const resolveCompanyForUser = async (user) => {
  const freshUser = user?.id ? await User.findById(String(user.id)) : null;
  const companyId = freshUser?.companyId || user?.companyId;

  if (companyId) {
    const byMembership = await Company.findById(String(companyId));
    if (byMembership) return byMembership;
  }
  return Company.findOne({ ownerUserId: user.id });
};

export const registerCompany = async (req, res) => {
  try {
    const {
      companyName,
      legalName,
      nif,
      industry,
      companySize,
      website,
      location,
      logo,
      description,
      contactPerson,
      contactEmail,
      phone,
    } = req.body;

    if (!companyName || !String(companyName).trim()) return res.status(400).json({ error: "companyName é obrigatório." });

    const duplicatedCompanyName = await findCompanyByNormalizedName(companyName);
    if (duplicatedCompanyName) {
      return res.status(409).json({ error: "Já existe uma empresa registada com este nome." });
    }

    const normalizedNif = normalizeCompanyIdentifier(nif);
    if (normalizedNif) {
      const duplicatedCompanyIdentifier = await findCompanyByIdentifier(normalizedNif);
      if (duplicatedCompanyIdentifier) {
        return res.status(409).json({ error: "Já existe uma empresa registada com este NIF." });
      }
    }

    const company = await Company.create({
      name: String(companyName).trim(),
      legalName,
      nif,
      companyIdentifier: normalizedNif || undefined,
      companyIdentifierType: normalizedNif ? "nif" : undefined,
      industry,
      size: companySize,
      website,
      location,
      logo,
      description,
      contactPerson,
      contactEmail,
      phone,
      ownerUserId: req.user.id,
      teamMemberUserIds: [req.user.id],
      verificationStatus: "pending",
    });

    await User.findByIdAndUpdate(req.user.id, { role: "company", companyId: company._id, companyTeamRole: "owner" });
    await logAudit({
      actorUserId: req.user.id,
      action: "company.register",
      resourceType: "Company",
      resourceId: String(company._id),
    });

    return res.status(201).json({ company });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getMyCompany = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  return res.status(200).json({ company });
};

export const updateMyCompany = async (req, res) => {
  if (!ensureCompanyPermission(req, res, ["owner", "recruiter"])) return;

  const existing = await resolveCompanyForUser(req.user);
  const payload = {
    ...req.body,
  };

  delete payload.ownerUserId;
  delete payload.teamMemberUserIds;

  const nextName = payload.name || payload.companyName;
  if (nextName) {
    const duplicatedCompanyName = await findCompanyByNormalizedName(nextName, existing?._id);
    if (duplicatedCompanyName) {
      return res.status(409).json({ error: "Já existe uma empresa registada com este nome." });
    }
  }

  const nextIdentifier = payload.nif || payload.companyIdentifier;
  const normalizedIdentifier = normalizeCompanyIdentifier(nextIdentifier);
  if (normalizedIdentifier) {
    const duplicatedCompanyIdentifier = await findCompanyByIdentifier(normalizedIdentifier, existing?._id);
    if (duplicatedCompanyIdentifier) {
      return res.status(409).json({ error: "Já existe uma empresa registada com este NIF." });
    }
    payload.companyIdentifier = normalizedIdentifier;
    payload.companyIdentifierType = payload.companyIdentifierType || "nif";
  }

  const company = existing
    ? await Company.findByIdAndUpdate(
        existing._id,
        {
          ...payload,
          teamMemberUserIds: dedupeIds([...(existing.teamMemberUserIds || []), req.user.id, existing.ownerUserId]),
        },
        { new: true }
      )
    : await Company.create({
        ...payload,
        name: payload.name || payload.companyName,
        ownerUserId: req.user.id,
        teamMemberUserIds: [req.user.id],
        verificationStatus: "pending",
      });

  await User.findByIdAndUpdate(req.user.id, { role: "company", companyId: company._id, companyTeamRole: req.user.companyTeamRole || "owner" });
  await logAudit({
    actorUserId: req.user.id,
    action: existing ? "company.profile.updated" : "company.profile.created",
    resourceType: "Company",
    resourceId: String(company._id),
  });

  return res.status(existing ? 200 : 201).json({ company });
};

export const uploadCompanyLogo = async (req, res) => {
  if (!ensureCompanyPermission(req, res, ["owner", "recruiter"])) return;

  if (!req.file) {
    return res.status(400).json({ error: "Ficheiro de logo não enviado." });
  }

  const existing = await resolveCompanyForUser(req.user);
  const logo = `/uploads/${req.file.filename}`;

  const company = existing
    ? await Company.findByIdAndUpdate(existing._id, {
        logo,
        teamMemberUserIds: dedupeIds([...(existing.teamMemberUserIds || []), req.user.id, existing.ownerUserId]),
      }, { new: true })
    : await Company.create({
        ownerUserId: req.user.id,
        logo,
        name: "Empresa",
        teamMemberUserIds: [req.user.id],
        verificationStatus: "pending",
      });

  await User.findByIdAndUpdate(req.user.id, { role: "company", companyId: company._id, companyTeamRole: req.user.companyTeamRole || "owner" });

  await logAudit({
    actorUserId: req.user.id,
    action: existing ? "company.logo.updated" : "company.logo.created",
    resourceType: "Company",
    resourceId: String(company._id),
    details: { logo },
  });

  return res.status(existing ? 200 : 201).json({ company, logoUrl: logo });
};

export const createJob = async (req, res) => {
  if (!ensureCompanyPermission(req, res, ["owner", "manager", "recruiter"])) return;

  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(400).json({ error: "Crie a empresa antes de publicar vagas." });
  if (!req.body.title || !req.body.description) {
    return res.status(400).json({ error: "title e description são obrigatórios." });
  }

  // Strip status and sourceType — companies cannot self-approve
  const { status: _status, sourceType: _sourceType, createdByUserId: _created, companyId: _cid, ...allowedFields } = req.body;

  const directPublishAllowed = canApproveCompanyJobs(company, req.user);
  const requestedEscalation = Boolean(req.body?.flagForPlatformReview);
  const needsPlatformReview = isPlatformReviewRequired(allowedFields, requestedEscalation);

  let nextStatus = JobStatuses.PENDING_COMPANY_APPROVAL;
  if (allowedFields.visibility === "draft") {
    nextStatus = JobStatuses.DRAFT;
  } else if (directPublishAllowed) {
    nextStatus = needsPlatformReview
      ? JobStatuses.PENDING_PLATFORM_REVIEW
      : (allowedFields.visibility === "public" ? JobStatuses.PUBLISHED : JobStatuses.APPROVED);
  }

  const assignedReviewer = !directPublishAllowed ? String(company.ownerUserId || "") : "";

  const job = await Job.create({
    ...allowedFields,
    companyId: company._id,
    companyLogo: company.logo || undefined,
    companyNameSnapshot: company.name || undefined,
    createdByUserId: req.user.id,
    status: nextStatus,
    sourceType: "company",
    assignedCompanyReviewerId: assignedReviewer || null,
    companyApprovalRequestedBy: req.user.id,
    companyApprovalRequestedAt: new Date().toISOString(),
  });

  await logAudit({
    actorUserId: req.user.id,
    action: "company.job.create",
    resourceType: "Job",
    resourceId: String(job._id),
    details: {
      companyId: String(company._id),
      status: nextStatus,
      assignedCompanyReviewerId: assignedReviewer || null,
      directPublishAllowed,
    },
  });

  return res.status(201).json({ job });
};

export const updateCompanyJob = async (req, res) => {
  if (!ensureCompanyPermission(req, res, ["owner", "recruiter"])) return;

  const company = await resolveCompanyForUser(req.user);
  const { id } = req.params;

  const job = await Job.findById(id);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });

  if (!company || String(job.companyId) !== String(company._id)) {
    return res.status(403).json({ error: "Não pode editar vagas de outra empresa." });
  }

  // Companies cannot promote themselves to approved
  const { status: _status, companyId: _cid, createdByUserId: _uid, sourceType: _src, ...editableFields } = req.body;

  Object.assign(job, editableFields);
  await job.save();

  return res.status(200).json({ job });
};

export const getCompanyJobs = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ jobs: [] });

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const status = String(req.query.status || "").trim();

  const query = {
    companyId: company._id,
    ...(status && status !== "all" ? { status } : {}),
  };

  const [jobs, total] = await Promise.all([
    Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Job.countDocuments(query),
  ]);

  return res.status(200).json({
    jobs,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
};

export const getCompanyApplications = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ applications: [] });

  const applications = await Application.find({ companyId: company._id })
    .populate("jobId")
    .sort({ updatedAt: -1 });

  return res.status(200).json({ applications });
};

export const getCompanyJobApprovals = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ approvals: [] });

  if (!canApproveCompanyJobs(company, req.user)) {
    return res.status(403).json({ error: "Sem permissão para aprovar pedidos de vagas da empresa." });
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const status = String(req.query.status || JobStatuses.PENDING_COMPANY_APPROVAL).trim();

  const query = {
    companyId: company._id,
    status,
  };

  const [jobs, total, requesters] = await Promise.all([
    Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Job.countDocuments(query),
    User.find({ companyId: company._id }).limit(500),
  ]);

  const requesterMap = new Map(requesters.map((item) => [String(item._id), item]));
  const approvals = jobs.map((job) => {
    const requester = requesterMap.get(String(job.createdByUserId || ""));
    return {
      ...job.toObject(),
      requester: requester
        ? {
            _id: requester._id,
            fullName: requester.fullName,
            email: requester.email,
          }
        : null,
    };
  });

  return res.status(200).json({
    approvals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
};

export const reviewCompanyJobApproval = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
  if (!canApproveCompanyJobs(company, req.user)) {
    return res.status(403).json({ error: "Sem permissão para aprovar pedidos de vagas da empresa." });
  }

  const { id } = req.params;
  const decision = String(req.body.decision || "").trim();
  const reason = String(req.body.reason || "").trim();
  const escalateToPlatformReview = Boolean(req.body.escalateToPlatformReview);

  if (!["approve", "reject", "request_changes"].includes(decision)) {
    return res.status(400).json({ error: "decision inválida." });
  }
  if (decision !== "approve" && !reason) {
    return res.status(400).json({ error: "reason é obrigatório para rejeitar ou pedir alterações." });
  }

  const job = await Job.findById(id);
  if (!job) return res.status(404).json({ error: "Vaga não encontrada." });
  if (String(job.companyId || "") !== String(company._id)) {
    return res.status(403).json({ error: "Não pode aprovar vagas de outra empresa." });
  }

  const previousStatus = job.status;
  let nextStatus = previousStatus;

  if (decision === "reject") {
    nextStatus = JobStatuses.COMPANY_REJECTED;
  } else if (decision === "request_changes") {
    nextStatus = JobStatuses.PENDING_COMPANY_APPROVAL;
  } else {
    const needsPlatformReview = isPlatformReviewRequired(job, escalateToPlatformReview);
    nextStatus = needsPlatformReview
      ? JobStatuses.PENDING_PLATFORM_REVIEW
      : (job.visibility === "public" ? JobStatuses.PUBLISHED : JobStatuses.APPROVED);
  }

  if (!canTransitionJobStatus(previousStatus, nextStatus)) {
    return res.status(400).json({ error: `Transição inválida de ${previousStatus || "(vazio)"} para ${nextStatus}.` });
  }

  job.status = nextStatus;
  job.companyApprovalReviewedBy = req.user.id;
  job.companyApprovalReviewedAt = new Date().toISOString();
  job.companyApprovalDecision = decision;
  job.companyApprovalReason = reason || "";
  if (nextStatus !== JobStatuses.PENDING_COMPANY_APPROVAL) {
    job.assignedCompanyReviewerId = null;
  }
  await job.save();

  await logAudit({
    actorUserId: req.user.id,
    action: "company.job.review",
    resourceType: "Job",
    resourceId: String(job._id),
    details: {
      companyId: String(company._id),
      previousStatus,
      nextStatus,
      decision,
      reason,
      escalateToPlatformReview,
    },
  });

  return res.status(200).json({ job });
};

export const inviteCompanyMember = async (req, res) => {
  try {
    const { email, teamRole = "recruiter", expiresInDays = 7 } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email é obrigatório." });
    }

    const company = await resolveCompanyForUser(req.user);
    if (!company) {
      return res.status(400).json({ error: "Crie a empresa antes de convidar membros." });
    }
    if (!isCompanyOwner(company, req.user.id)) {
      return res.status(403).json({ error: "Apenas o primeiro utilizador (owner) pode convidar membros." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(409).json({ error: "Email já está em uso." });

    const activeInvite = await CompanyInvite.findOne({
      companyId: company._id,
      email: normalizedEmail,
      status: "pending",
    });
    if (activeInvite) return res.status(409).json({ error: "Já existe convite pendente para este email." });

    const days = Number(expiresInDays) > 0 ? Number(expiresInDays) : 7;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const invite = await CompanyInvite.create({
      companyId: company._id,
      invitedByUserId: req.user.id,
      email: normalizedEmail,
      teamRole: normalizeTeamRole(teamRole),
      token: makeInviteToken(),
      status: "pending",
      sentCount: 1,
      lastSentAt: new Date().toISOString(),
      expiresAt,
    });

    const inviteLink = `${publicSiteUrl()}/Signup?role=company&inviteToken=${invite.token}`;
    const template = companyInviteEmailTemplate({
      companyName: company.name,
      inviteLink,
      roleLabel: invite.teamRole,
      expiresAt,
    });
    const emailLog = await sendEmailNotification({
      userId: req.user.id,
      toEmail: invite.email,
      subject: template.subject,
      body: template.text,
      html: template.html,
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "company.member.invite",
      resourceType: "CompanyInvite",
      resourceId: String(invite._id),
      details: { companyId: String(company._id), invitedEmail: invite.email, teamRole: invite.teamRole, expiresAt },
    });

    return res.status(201).json({
      invite,
      inviteLink,
      emailDelivery: {
        status: emailLog?.status || "unknown",
        error: emailLog?.error || "",
      },
    });
  } catch (error) {
    const message = String(error?.message || "");
    const missingInviteTable = message.includes("company_invites") || message.includes("schema cache");
    return res.status(missingInviteTable ? 503 : 500).json({
      error: missingInviteTable
        ? "Convites indisponíveis: tabela company_invites não encontrada. Execute a migração de schema."
        : message || "Erro ao criar convite.",
    });
  }
};

export const listCompanyMembers = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ members: [], ownerUserId: null });

  const members = await User.find({ companyId: company._id }).sort({ createdAt: 1 });
  const safe = members.map((member) => {
    const userObject = member.toObject();
    delete userObject.password;
    return userObject;
  });

  return res.status(200).json({ members: safe, ownerUserId: String(company.ownerUserId || "") });
};

export const listCompanyInvites = async (req, res) => {
  try {
    const company = await resolveCompanyForUser(req.user);
    if (!company) return res.status(200).json({ invites: [] });

    const invites = await CompanyInvite.find({ companyId: company._id }).sort({ createdAt: -1 });
    const now = Date.now();
    const normalized = invites.map((invite) => {
      const base = invite.toObject ? invite.toObject() : invite;
      const expired = invite.status === "pending" && invite.expiresAt && new Date(invite.expiresAt).getTime() < now;
      return {
        ...base,
        status: expired ? "expired" : base.status,
      };
    });
    return res.status(200).json({ invites: normalized });
  } catch (error) {
    const message = String(error?.message || "Erro ao listar convites.");
    return res.status(500).json({ error: message });
  }
};

export const resendCompanyInvite = async (req, res) => {
  try {
    const company = await resolveCompanyForUser(req.user);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    if (!isCompanyOwner(company, req.user.id)) {
      return res.status(403).json({ error: "Apenas o owner pode reenviar convites." });
    }

    const invite = await CompanyInvite.findById(req.params.id);
    if (!invite || String(invite.companyId) !== String(company._id)) {
      return res.status(404).json({ error: "Convite não encontrado." });
    }
    if (invite.status === "revoked") return res.status(400).json({ error: "Convite revogado." });
    if (invite.status === "accepted") return res.status(400).json({ error: "Convite já aceite." });

    invite.status = "pending";
    invite.sentCount = Number(invite.sentCount || 0) + 1;
    invite.lastSentAt = new Date().toISOString();
    invite.expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await invite.save();

    const inviteLink = `${publicSiteUrl()}/Signup?role=company&inviteToken=${invite.token}`;
    const template = companyInviteEmailTemplate({
      companyName: company.name,
      inviteLink,
      roleLabel: invite.teamRole,
      expiresAt: invite.expiresAt,
    });
    const emailLog = await sendEmailNotification({
      userId: req.user.id,
      toEmail: invite.email,
      subject: template.subject,
      body: template.text,
      html: template.html,
    });

    await logAudit({
      actorUserId: req.user.id,
      action: "company.member.invite.resend",
      resourceType: "CompanyInvite",
      resourceId: String(invite._id),
      details: { companyId: String(company._id), invitedEmail: invite.email },
    });

    return res.status(200).json({
      invite,
      inviteLink,
      emailDelivery: {
        status: emailLog?.status || "unknown",
        error: emailLog?.error || "",
      },
    });
  } catch (error) {
    const message = String(error?.message || "Erro ao reenviar convite.");
    return res.status(500).json({ error: message });
  }
};

export const revokeCompanyInvite = async (req, res) => {
  try {
    const company = await resolveCompanyForUser(req.user);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    if (!isCompanyOwner(company, req.user.id)) {
      return res.status(403).json({ error: "Apenas o owner pode revogar convites." });
    }

    const invite = await CompanyInvite.findById(req.params.id);
    if (!invite || String(invite.companyId) !== String(company._id)) {
      return res.status(404).json({ error: "Convite não encontrado." });
    }
    if (invite.status === "accepted") return res.status(400).json({ error: "Convite já aceite." });

    invite.status = "revoked";
    invite.revokedAt = new Date().toISOString();
    await invite.save();

    await logAudit({
      actorUserId: req.user.id,
      action: "company.member.invite.revoke",
      resourceType: "CompanyInvite",
      resourceId: String(invite._id),
      details: { companyId: String(company._id), invitedEmail: invite.email },
    });

    return res.status(200).json({ invite });
  } catch (error) {
    const message = String(error?.message || "Erro ao revogar convite.");
    return res.status(500).json({ error: message });
  }
};

export const updateCompanyMemberRole = async (req, res) => {
  try {
    const company = await resolveCompanyForUser(req.user);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    if (!isCompanyOwner(company, req.user.id)) {
      return res.status(403).json({ error: "Apenas o owner pode alterar roles da equipa." });
    }

    const memberId = String(req.params.id || "");
    const nextRole = normalizeTeamRole(req.body.teamRole);

    if (!memberId) return res.status(400).json({ error: "Membro inválido." });
    if (String(company.ownerUserId) === memberId) {
      return res.status(400).json({ error: "Não pode alterar a role do owner." });
    }
    if (String(req.user.id) === memberId) {
      return res.status(400).json({ error: "Não pode alterar a sua própria role." });
    }

    const member = await User.findById(memberId);
    if (!member || String(member.companyId || "") !== String(company._id)) {
      return res.status(404).json({ error: "Membro não encontrado na sua empresa." });
    }

    member.companyTeamRole = nextRole;
    await member.save();

    await logAudit({
      actorUserId: req.user.id,
      action: "company.member.role.update",
      resourceType: "User",
      resourceId: String(member._id),
      details: { companyId: String(company._id), teamRole: nextRole },
    });

    const safe = member.toObject();
    delete safe.password;
    return res.status(200).json({ member: safe });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Erro ao atualizar role do membro.") });
  }
};

export const removeCompanyMember = async (req, res) => {
  try {
    const company = await resolveCompanyForUser(req.user);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    if (!isCompanyOwner(company, req.user.id)) {
      return res.status(403).json({ error: "Apenas o owner pode remover membros." });
    }

    const memberId = String(req.params.id || "");
    if (!memberId) return res.status(400).json({ error: "Membro inválido." });
    if (String(company.ownerUserId) === memberId) {
      return res.status(400).json({ error: "Não pode remover o owner." });
    }
    if (String(req.user.id) === memberId) {
      return res.status(400).json({ error: "Não pode remover a sua própria conta da empresa." });
    }

    const member = await User.findById(memberId);
    if (!member || String(member.companyId || "") !== String(company._id)) {
      return res.status(404).json({ error: "Membro não encontrado na sua empresa." });
    }

    member.companyId = null;
    member.companyTeamRole = null;
    member.role = "candidate";
    await member.save();

    const nextTeam = dedupeIds((company.teamMemberUserIds || []).filter((id) => String(id) !== memberId));
    await Company.findByIdAndUpdate(company._id, { teamMemberUserIds: nextTeam });

    await logAudit({
      actorUserId: req.user.id,
      action: "company.member.remove",
      resourceType: "User",
      resourceId: String(member._id),
      details: { companyId: String(company._id) },
    });

    return res.status(200).json({ removedMemberId: memberId });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || "Erro ao remover membro.") });
  }
};

export const getCompanyAuditTimeline = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ entries: [] });

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const actionFilter = String(req.query.action || "").trim().toLowerCase();
  const resourceTypeFilter = String(req.query.resourceType || "").trim().toLowerCase();
  const actorUserIdFilter = String(req.query.actorUserId || "").trim();
  const keywordFilter = String(req.query.keyword || "").trim().toLowerCase();

  const jobs = await Job.find({ companyId: company._id }).limit(500);
  const jobIds = jobs.map((job) => String(job._id));
  const applications = await Application.find({ companyId: company._id }).limit(1000);
  const appIds = applications.map((application) => String(application._id));

  const allEntries = await AuditLog.find({}).sort({ createdAt: -1 }).limit(2000);
  const rawEntries = allEntries.filter((entry) => {
    const resourceType = String(entry.resourceType || "");
    const resourceId = String(entry.resourceId || "");
    const detailsCompanyId = String(entry.details?.companyId || "");

    const belongsToCompany =
      (resourceType === "Company" && resourceId === String(company._id)) ||
      (resourceType === "Job" && jobIds.includes(resourceId)) ||
      (resourceType === "Application" && appIds.includes(resourceId)) ||
      (resourceType === "CompanyInvite" && detailsCompanyId === String(company._id));

    if (!belongsToCompany) return false;
    if (actionFilter && !String(entry.action || "").toLowerCase().includes(actionFilter)) return false;
    if (resourceTypeFilter && String(entry.resourceType || "").toLowerCase() !== resourceTypeFilter) return false;
    if (actorUserIdFilter && String(entry.actorUserId || "") !== actorUserIdFilter) return false;

    if (keywordFilter) {
      const haystack = JSON.stringify({
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details,
      }).toLowerCase();
      if (!haystack.includes(keywordFilter)) return false;
    }

    return true;
  });

  const total = rawEntries.length;
  const start = (page - 1) * limit;
  const pagedEntries = rawEntries.slice(start, start + limit);

  const actorIds = dedupeIds(pagedEntries.map((entry) => entry.actorUserId).filter(Boolean));
  const actors = actorIds.length ? await User.find({ _id: { $in: actorIds } }).limit(actorIds.length) : [];
  const actorMap = new Map(actors.map((actor) => [String(actor._id), actor]));

  const entries = pagedEntries.map((entry) => {
    const actor = actorMap.get(String(entry.actorUserId || ""));
    return {
      _id: entry._id,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details || {},
      createdAt: entry.createdAt,
      actor: actor ? { _id: actor._id, fullName: actor.fullName, email: actor.email } : null,
    };
  });

  return res.status(200).json({
    entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  });
};

export const heartbeatCompanyPresence = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ onlineUsersCount: 0, isDoubleLogged: false });

  const presence = await companyPresenceHeartbeat(String(company._id), String(req.user.id));
  return res.status(200).json({
    onlineUsersCount: presence.onlineUsersCount,
    isDoubleLogged: presence.isDoubleLogged,
    message: presence.isDoubleLogged ? "double user logged" : "single session",
    source: presence.source,
  });
};

export const getCompanyPresenceStatus = async (req, res) => {
  const company = await resolveCompanyForUser(req.user);
  if (!company) return res.status(200).json({ onlineUsersCount: 0, isDoubleLogged: false });

  const presence = await companyPresenceStatus(String(company._id));

  return res.status(200).json({
    onlineUsersCount: presence.onlineUsersCount,
    isDoubleLogged: presence.isDoubleLogged,
    message: presence.isDoubleLogged ? "double user logged" : "single session",
    source: presence.source,
  });
};

export const verifyCompany = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const reason = String(req.body.reason || "").trim();
  const allowedStatuses = ["verified", "rejected", "pending", "needs_more_info", "suspended"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Estado de verificação inválido." });
  }

  if (status === "suspended" && normalizeAdminLevel(req.user.adminLevel) !== "super-admin") {
    return res.status(403).json({ error: "Apenas super-admin pode suspender empresas." });
  }

  if (["rejected", "needs_more_info", "suspended"].includes(status) && !reason) {
    return res.status(400).json({ error: "reason é obrigatório para este estado de verificação." });
  }

  const company = await Company.findByIdAndUpdate(
    id,
    { verificationStatus: status, verificationNote: reason || "" },
    { new: true }
  );
  if (!company) return res.status(404).json({ error: "Empresa não encontrada." });

  await logAdminAction({
    adminUserId: req.user.id,
    action: "company.verification.update",
    targetType: "Company",
    targetId: String(company._id),
    payload: { status, reason },
  });

  if (company.contactEmail) {
    await sendEmailNotification({
      userId: req.user.id,
      toEmail: String(company.contactEmail),
      subject: `Parvagas | Estado da empresa: ${status}`,
      body: `O estado de verificação da empresa ${company.name || ""} foi atualizado para ${status}.${reason ? ` Motivo: ${reason}` : ""}`,
    }).catch(() => null);
  }

  return res.status(200).json({ company });
};
