import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { pingSupabase } from "./db/modelFactory.js";
import { authLimiter, uploadLimiter, applyLimiter, generalLimiter } from "./middleware/rateLimiter.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import applicationRoutes from "./routes/applications.js";
import candidateRoutes from "./routes/candidates.js";
import companyRoutes from "./routes/companies.js";
import jobRoutes from "./routes/jobs.js";
import adminRoutes from "./routes/admin.js";
import publicRoutes from "./routes/public.js";
import { initSentry, captureSentryException } from "./services/sentryService.js";

function normalizeErrorMessage(message) {
  const raw = String(message || "").trim();
  if (!raw) return "";

  const withoutRepeatedPrefix = raw.replace(/^(?:error\s*:\s*)+/i, "").trim();
  const compact = withoutRepeatedPrefix
    .replace(/\s+/g, " ")
    .replace(/([.!?])\1+/g, "$1")
    .trim();

  const duplicatePattern = /^(.+?)\s*(?:\||-|\.)\s*\1$/i;
  const duplicateMatch = compact.match(duplicatePattern);
  if (duplicateMatch?.[1]) return duplicateMatch[1].trim();

  return compact;
}

/* Middleware CONFIGURATIONS */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shellEnv = {
  nodeEnv: String(process.env.NODE_ENV || "").trim(),
  port: String(process.env.PORT || "").trim(),
  publicApiUrl: String(process.env.NEXT_PUBLIC_API_URL || "").trim(),
  corsOrigin: String(process.env.CORS_ORIGIN || "").trim(),
};

dotenv.config({ path: new URL(".env", import.meta.url).pathname });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(__dirname, ".env.local"), override: true });

const forcedLocalPort = "6001";
const forcedLocalApiUrl = `http://localhost:${forcedLocalPort}`;
const forcedLocalCorsOrigin = "http://localhost:3000";
const runningLocally = process.env.RENDER !== "true" && process.env.NODE_ENV !== "test";

if (runningLocally) {
  process.env.NODE_ENV = shellEnv.nodeEnv || "development";

  if (!shellEnv.port && (!process.env.PORT || process.env.PORT === "3001")) {
    process.env.PORT = forcedLocalPort;
  }

  if (
    !shellEnv.publicApiUrl &&
    (!process.env.NEXT_PUBLIC_API_URL || /^https?:\/\/(api\.|parvagas\.)/i.test(process.env.NEXT_PUBLIC_API_URL))
  ) {
    process.env.NEXT_PUBLIC_API_URL = forcedLocalApiUrl;
  }

  if (
    !shellEnv.corsOrigin &&
    (!process.env.CORS_ORIGIN || !/localhost|127\.0\.0\.1/i.test(process.env.CORS_ORIGIN))
  ) {
    process.env.CORS_ORIGIN = forcedLocalCorsOrigin;
  }
}

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "https://parvagas.co.ao"];
const allowLocalDevCors = process.env.ALLOW_LOCAL_DEV_CORS !== "false";

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const requestId = req.headers["x-request-id"] || crypto.randomUUID();
    req.requestId = String(requestId);
    res.setHeader("x-request-id", String(requestId));
    next();
  });

  app.use(express.json());
  app.use(helmet());
  app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
  app.use(morgan("common"));
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
  app.use(
    cors({
      origin: (origin, callback) => {
        const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || "");
        if (!origin || allowedOrigins.includes(origin) || (allowLocalDevCors && isLocalDevOrigin)) {
          callback(null, true);
        } else {
          callback(new Error("CORS: origin not allowed"));
        }
      },
      credentials: true,
    })
  );

  // Remove password from all responses
  app.use((_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      const sanitized = JSON.parse(
        JSON.stringify(data, (key, value) => (key === "password" ? undefined : value))
      );
      return originalJson(sanitized);
    };
    next();
  });

  app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

  /* HEALTH CHECK */
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok", ts: new Date().toISOString() }));

  /* RATE LIMITING per route group */
  app.use("/auth", authLimiter);
  app.use("/candidates/cv", uploadLimiter);
  app.use("/candidates/jobs/apply", applyLimiter);
  app.use("/applications", applyLimiter);
  app.use(generalLimiter);

  /* ROUTES */
  app.use("/auth", authRoutes);
  app.use("/users", userRoutes);
  app.use("/applications", applicationRoutes);
  app.use("/candidates", candidateRoutes);
  app.use("/companies", companyRoutes);
  app.use("/jobs", jobRoutes);
  app.use("/admin", adminRoutes);
  app.use("/public", publicRoutes);

  app.use((req, res) => {
    return res.status(404).json({
      error: "Rota não encontrada.",
      path: req.originalUrl,
      requestId: req.requestId,
    });
  });

  app.use((err, req, res, _next) => {
    const status = Number(err?.status || err?.statusCode || 500);
    const exposeDetails = status >= 400 && status < 500;
    const message = normalizeErrorMessage(
      typeof err?.message === "string" && err.message.trim()
        ? err.message
        : "Erro interno do servidor.",
    );

    console.error("[server-error]", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      message,
      stack: err?.stack,
    });

    captureSentryException(err, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
    });

    return res.status(status).json({
      error: exposeDetails ? message || "Não foi possível concluir o pedido." : "Erro interno do servidor.",
      requestId: req.requestId,
    });
  });

  return app;
}

/* Supabase startup check — only runs when this file is the entry point */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initSentry();

  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
    captureSentryException(reason instanceof Error ? reason : new Error(String(reason || "Unhandled rejection")), {
      source: "process.unhandledRejection",
    });
  });

  process.on("uncaughtException", (error) => {
    console.error("[uncaughtException]", error);
    captureSentryException(error, { source: "process.uncaughtException" });
  });

  const app = createApp();
  const PORT = process.env.PORT || 6001;
  const publicApiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").trim();

  if (process.env.NODE_ENV !== "production" && publicApiUrl && !publicApiUrl.includes(`:${PORT}`)) {
    console.warn(
      `[dev-warning] NEXT_PUBLIC_API_URL (${publicApiUrl}) não corresponde ao PORT do servidor (${PORT}).`
    );
  }

  pingSupabase()
    .then(() => {
      const server = app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
      server.on("error", (error) => {
        if (error && error.code === "EADDRINUSE") {
          console.error(
            `[dev-error] Porta ${PORT} já está em uso. Termine o processo atual ou ajuste PORT/NEXT_PUBLIC_API_URL.`
          );
          return;
        }
        console.error("[server-listen-error]", error);
      });
    })
    .catch((error) => {
      console.log(`${error} did not connect`);
      process.exit(1);
    });
}

