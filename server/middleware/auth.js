import jwt from "jsonwebtoken";
import { normalizeAdminLevel, requirePermission, requireAnyPermission, hasPermission } from "../services/rbacService.js";

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
    if (verified.suspended) {
      return res.status(403).json({ error: "Conta suspensa." });
    }
    req.user = {
      ...verified,
      adminLevel: verified.role === "admin" ? normalizeAdminLevel(verified.adminLevel) : undefined,
    };
    next();
  } catch (err) {
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