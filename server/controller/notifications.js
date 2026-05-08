import UserNotification from "../models/userNotification.js";
import Company from "../models/company.js";
import User from "../models/user.js";
import { logAudit } from "../services/auditService.js";

const MESSAGE_REASONS = [
  "Solicitar aprovação de vaga",
  "Atualizar perfil",
  "Assunto administrativo",
  "Outro",
];

const stripTags = (value) => String(value || "").replace(/<[^>]*>/g, "").trim();

const clampText = (value, max) => stripTags(value).slice(0, max);

const readPagination = (req, { defaultLimit = 20, maxLimit = 50 } = {}) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const ensureOwnership = (notification, userId) => String(notification?.userId || "") === String(userId || "");

export const listMyNotifications = async (req, res) => {
  const { page, limit, skip } = readPagination(req, { defaultLimit: 15, maxLimit: 50 });
  const all = await UserNotification.find({ userId: req.user.id }).sort({ createdAt: -1 });
  const total = all.length;
  const notifications = all.slice(skip, skip + limit);
  const unreadCount = all.filter((item) => !item.readAt).length;

  return res.status(200).json({
    notifications,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
};

export const markNotificationRead = async (req, res) => {
  const notification = await UserNotification.findById(req.params.id);
  if (!notification || !ensureOwnership(notification, req.user.id)) {
    return res.status(404).json({ error: "Notificação não encontrada." });
  }

  const updated = await UserNotification.findByIdAndUpdate(
    notification._id,
    { readAt: new Date().toISOString() },
    { new: true }
  );

  return res.status(200).json({ notification: updated });
};

export const markNotificationUnread = async (req, res) => {
  const notification = await UserNotification.findById(req.params.id);
  if (!notification || !ensureOwnership(notification, req.user.id)) {
    return res.status(404).json({ error: "Notificação não encontrada." });
  }

  const updated = await UserNotification.findByIdAndUpdate(notification._id, { readAt: null }, { new: true });
  return res.status(200).json({ notification: updated });
};

export const resolveNotification = async (req, res) => {
  const notification = await UserNotification.findById(req.params.id);
  if (!notification || !ensureOwnership(notification, req.user.id)) {
    return res.status(404).json({ error: "Notificação não encontrada." });
  }

  const updated = await UserNotification.findByIdAndUpdate(
    notification._id,
    {
      resolvedAt: new Date().toISOString(),
      readAt: notification.readAt || new Date().toISOString(),
    },
    { new: true }
  );

  await logAudit({
    actorUserId: req.user.id,
    action: "notification.resolve",
    resourceType: "UserNotification",
    resourceId: String(notification._id),
  });

  return res.status(200).json({ notification: updated });
};

export const sendCompanyAdminMessage = async (req, res) => {
  if (req.user.role !== "company") {
    return res.status(403).json({ error: "Apenas utilizadores empresa podem enviar esta mensagem." });
  }

  const sender = await User.findById(req.user.id);
  if (!sender || !sender.companyId) {
    return res.status(400).json({ error: "Conta empresa inválida para envio de mensagem interna." });
  }

  const company = await Company.findById(String(sender.companyId));
  if (!company) {
    return res.status(404).json({ error: "Empresa não encontrada." });
  }

  const reason = clampText(req.body.reason, 80);
  const customMessage = clampText(req.body.message, 600);

  if (!reason && !customMessage) {
    return res.status(400).json({ error: "Informe um motivo ou mensagem." });
  }

  if (reason && !MESSAGE_REASONS.includes(reason) && reason !== "Outro") {
    return res.status(400).json({ error: "Motivo inválido." });
  }

  const recipientUserId = String(company.ownerUserId || "");
  if (!recipientUserId) {
    return res.status(400).json({ error: "Empresa sem administrador principal definido." });
  }

  if (recipientUserId === String(req.user.id)) {
    return res.status(400).json({ error: "Conta principal não precisa enviar mensagem para si mesma." });
  }

  const title = reason || "Mensagem interna da equipa";
  const summary = customMessage || "Solicitação enviada pela equipa da empresa.";

  const notification = await UserNotification.create({
    userId: recipientUserId,
    senderUserId: req.user.id,
    companyId: String(company._id),
    type: "company_internal_message",
    title,
    description: summary,
    metadata: {
      reason: reason || "Outro",
      senderName: sender.fullName || sender.email || "Utilizador",
      senderRole: sender.companyTeamRole || "recruiter",
    },
    readAt: null,
    resolvedAt: null,
  });

  await logAudit({
    actorUserId: req.user.id,
    action: "company.internal_message.send",
    resourceType: "UserNotification",
    resourceId: String(notification._id),
    details: {
      companyId: String(company._id),
      recipientUserId,
      reason: reason || "Outro",
    },
  });

  return res.status(201).json({ notification, message: "Mensagem enviada ao administrador da empresa." });
};
