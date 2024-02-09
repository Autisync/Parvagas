import express from "express";
import {
  getUser,
  updatePassword,
} from "../controller/users.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/* READ */
router.get("/:id", verifyToken, getUser);

/* UPDATE */
router.patch("/:id/password", verifyToken, updatePassword);

export default router;