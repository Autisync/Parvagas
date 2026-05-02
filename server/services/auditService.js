import AuditLog from "../models/auditLog.js";
import AdminAction from "../models/adminAction.js";

export const logAudit = async ({
  actorUserId = null,
  actorRole = "",
  action,
  resourceType = "",
  resourceId = "",
  before = null,
  after = null,
  reason = "",
  note = "",
  ip = "",
  userAgent = "",
  details = {},
}) => {
  return AuditLog.create({
    actorUserId,
    actorRole,
    action,
    resourceType,
    resourceId,
    details: {
      ...details,
      before,
      after,
      reason,
      note,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    },
  });
};

export const logAdminAction = async ({
  adminUserId,
  action,
  targetType = "",
  targetId = "",
  payload = {},
  before = null,
  after = null,
  reason = "",
  note = "",
  ip = "",
  userAgent = "",
}) => {
  await logAudit({
    actorUserId: adminUserId,
    actorRole: "admin",
    action: `admin:${action}`,
    resourceType: targetType,
    resourceId: targetId,
    before,
    after,
    reason,
    note,
    ip,
    userAgent,
    details: payload,
  });

  return AdminAction.create({
    adminUserId,
    action,
    targetType,
    targetId,
    payload,
  });
};
