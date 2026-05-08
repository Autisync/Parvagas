import express from "express";
import {login, register, firstLoginReset, forgotPassword, resetPassword, acceptCompanyInvite, logout} from "../controller/auth.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/* LOGIN */
router.post('/login', login)
/* REGISTER */
router.post('/register', register)
router.post('/first-login-reset', firstLoginReset)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/company-invite/accept', acceptCompanyInvite)
router.post('/logout', verifyToken, logout)

export default router;