import rateLimit from "express-rate-limit";
import { captureSentryMessage } from "../services/sentryService.js";

const isTest = process.env.NODE_ENV === "test";

const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const windowMs = 15 * 60 * 1000; // 15 minutes
const publicReadWindowMs = 60 * 1000; // 1 minute burst window

function createLimiterHandler(routeClass) {
  return (req, res, _next, options) => {
    captureSentryMessage("rate_limit_exceeded", {
      routeClass,
      method: req.method,
      path: req.originalUrl || req.path,
      ip: req.ip || "",
      userAgent: String(req.headers["user-agent"] || ""),
    });

    return res.status(options.statusCode).json(options.message);
  };
}

function skipInternalPaths(req) {
  const path = String(req.path || req.originalUrl || "");
  if (path === "/health" || path.startsWith("/events/")) return true;
  return false;
}

function isBurstManagedReadPath(req) {
  const path = String(req.path || req.originalUrl || "");
  return path.startsWith("/public") || path.startsWith("/jobs");
}

function skipByMethod(methodMatcher) {
  return (req) => {
    if (isTest) return true;
    if (skipInternalPaths(req)) return true;
    return methodMatcher(req);
  };
}

const skipWhenReadOnly = skipByMethod((req) => readMethods.has(String(req.method || "").toUpperCase()));
const skipWhenWriteOnly = skipByMethod((req) => !readMethods.has(String(req.method || "").toUpperCase()));
const skipInTestOrInternal = skipByMethod(() => false);

export const authLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas tentativas. Aguarde 15 minutos." },
  handler: createLimiterHandler("auth"),
  skip: skipInTestOrInternal,
});

export const uploadLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados uploads. Aguarde 15 minutos." },
  handler: createLimiterHandler("upload"),
  skip: skipInTestOrInternal,
});

export const applyLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_APPLY_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas candidaturas. Aguarde 15 minutos." },
  handler: createLimiterHandler("apply"),
  skip: skipInTestOrInternal,
});

export const publicReadLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_PUBLIC_READ_WINDOW_MS || publicReadWindowMs),
  max: Number(process.env.RATE_LIMIT_PUBLIC_READ_MAX || 900000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos pedidos públicos. Aguarde alguns instantes." },
  handler: createLimiterHandler("public_read"),
  skip: skipWhenWriteOnly,
});

export const generalReadLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_GENERAL_READ_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos de leitura. Aguarde 15 minutos." },
  handler: createLimiterHandler("general_read"),
  skip: (req) => skipWhenWriteOnly(req) || isBurstManagedReadPath(req),
});

export const writeLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_WRITE_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas operações de escrita. Aguarde 15 minutos." },
  handler: createLimiterHandler("write"),
  skip: skipWhenReadOnly,
});

export const internalCompanyMessageLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_INTERNAL_MESSAGE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas mensagens internas num curto período. Aguarde 15 minutos." },
  handler: createLimiterHandler("internal_company_message"),
  skip: skipInTestOrInternal,
});
