import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { internalCompanyMessageLimiter } from "../middleware/rateLimiter.js";
import {
  listMyNotifications,
  markNotificationRead,
  markNotificationUnread,
  resolveNotification,
  sendCompanyAdminMessage,
} from "../controller/notifications.js";

const router = express.Router();

router.get("/", verifyToken, listMyNotifications);
router.patch("/:id/read", verifyToken, markNotificationRead);
router.patch("/:id/unread", verifyToken, markNotificationUnread);
router.patch("/:id/resolve", verifyToken, resolveNotification);
router.post("/company-admin-message", verifyToken, internalCompanyMessageLimiter, sendCompanyAdminMessage);

export default router;
