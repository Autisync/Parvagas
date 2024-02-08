import express from "express";
import {login, register} from "../controller/auth";

const router = express.Router();

/* LOGIN */
router.post('/login', login)
/* REGISTER */
router.post('/register', register)

export default router;