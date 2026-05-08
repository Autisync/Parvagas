import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { normalizeAdminLevel, requirePermission, requireAnyPermission, hasPermission } from "../services/rbacService.js";

const getSessionIdleTimeoutMs = (user) => Number(user?.sessionIdleTimeoutMs || process.env.AUTH_SESSION_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const getSessionTouchIntervalMs = () => Number(process.env.AUTH_SESSION_TOUCH_INTERVAL_MS || 60 * 1000);

export const verifyToken = async (req, res, next) => {
  try {
    let token = req.header("Authorization");

    if (!token) {
        // if token does not exist
      return res.status(403).send("Access Denied");
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7, token.length).trimLeft();
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(verified.id);

    if (!user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    if (verified.suspended || user.suspended) {
      return res.status(403).json({ error: "Conta suspensa." });
    }

    const activeSessionId = String(user.activeSessionId || "").trim();
    const tokenSessionId = String(verified.sid || "").trim();
    if (!activeSessionId || !tokenSessionId || activeSessionId !== tokenSessionId) {
      return res.status(401).json({ error: "A sua sessão já não é válida. Faça login novamente." });
    }

    const idleTimeoutMs = getSessionIdleTimeoutMs(user);
    const lastActivityAt = new Date(user.lastActivityAt || user.activeSessionStartedAt || 0).getTime();
    const now = Date.now();

    if (lastActivityAt > 0 && now - lastActivityAt > idleTimeoutMs) {
      await User.findByIdAndUpdate(user._id, {
        activeSessionId: null,
        activeSessionStartedAt: null,
        lastActivityAt: null,
        sessionRevokedAt: new Date(now).toISOString(),
      }).catch(() => null);
      return res.status(401).json({ error: "Sessão expirada por inatividade. Faça login novamente." });
    }

    if (now - lastActivityAt >= getSessionTouchIntervalMs()) {
      await User.findByIdAndUpdate(user._id, { lastActivityAt: new Date(now).toISOString() }).catch(() => null);
    }

    req.user = {
      ...verified,
      id: String(user._id),
      sessionId: activeSessionId,
      companyId: user.companyId || verified.companyId || null,
      companyTeamRole: user.companyTeamRole || verified.companyTeamRole,
      adminLevel: verified.role === "admin" ? normalizeAdminLevel(verified.adminLevel) : undefined,
    };
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError" || err?.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    res.status(500).json({ error: err.message });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Permissão insuficiente." });
    }
    return next();
  };
};

export const requireAdminLevel = (...levels) => {
  return (req, res, next) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Permissão insuficiente." });
    }

    const allowed = levels.map((l) => String(l || "").toLowerCase());
    const level = normalizeAdminLevel(req.user?.adminLevel);
    if (!allowed.includes(level)) {
      return res.status(403).json({ error: "Ação restrita para super-admin." });
    }

    req.user.adminLevel = level;
    return next();
  };
};

export { requirePermission, requireAnyPermission, hasPermission };