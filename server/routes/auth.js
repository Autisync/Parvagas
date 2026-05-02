import express from "express";
import {login, register, firstLoginReset, forgotPassword, resetPassword, acceptCompanyInvite} from "../controller/auth.js";

const router = express.Router();

/* LOGIN */
router.post('/login', login)
/* REGISTER */
router.post('/register', register)
router.post('/first-login-reset', firstLoginReset)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/company-invite/accept', acceptCompanyInvite)

export default router;