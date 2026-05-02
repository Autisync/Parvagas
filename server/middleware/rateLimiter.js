import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

// In test environments, skip all rate limiting
const skipInTest = { skip: () => isTest };

const windowMs = 15 * 60 * 1000; // 15 minutes

export const authLimiter = rateLimit({
  windowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas tentativas. Aguarde 15 minutos." },
  ...skipInTest,
});

export const uploadLimiter = rateLimit({
  windowMs,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados uploads. Aguarde 15 minutos." },
  ...skipInTest,
});

export const applyLimiter = rateLimit({
  windowMs,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas candidaturas. Aguarde 15 minutos." },
  ...skipInTest,
});

export const generalLimiter = rateLimit({
  windowMs,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos. Aguarde 15 minutos." },
  ...skipInTest,
});
