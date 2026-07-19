import { isAbsolute, join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";
import { findWorkspaceRoot } from "@reactive-resume/utils/monorepo.node";

const workspaceRoot = findWorkspaceRoot();

if (workspaceRoot) {
	config({ path: join(workspaceRoot, ".env"), quiet: true });
}

export const env = createEnv({
	server: {
		// Application
		APP_URL: z.url({ protocol: /https?/ }),
		APP_NAME: z.string().default("Parvagas CV Builder"),
		SUPPORT_EMAIL: z.email().default("suporte@parvagas.pt"),
		SUPPORT_URL: z.url({ protocol: /https?/ }).optional(),
		PUBLIC_PRODUCT_NAME: z.string().min(1).default("Parvagas CV Builder"),
		PUBLIC_MAIN_PLATFORM_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt"),
		PUBLIC_SUPPORT_EMAIL: z.email().default("suporte@parvagas.pt"),
		PUBLIC_SUPPORT_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt/contactos"),
		PUBLIC_PRIVACY_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt/privacidade"),
		PUBLIC_TERMS_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt/termos"),
		PUBLIC_AUTISYNC_URL: z.url({ protocol: /https?/ }).default("https://www.autisync.com/"),
		SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

		// Database
		DATABASE_URL: z.url({ protocol: /postgres(ql)?/ }),

		// Authentication
		AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_API_KEY: z.string().min(1).optional(),

		// Social Auth (Google)
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

		// Social Auth (GitHub)
		GITHUB_CLIENT_ID: z.string().min(1).optional(),
		GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

		// Social Auth (LinkedIn)
		LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
		LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),

		// Custom OAuth Provider
		OAUTH_PROVIDER_NAME: z.string().min(1).optional(),
		OAUTH_CLIENT_ID: z.string().min(1).optional(),
		OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
		OAUTH_DISCOVERY_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_AUTHORIZATION_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_TOKEN_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_USER_INFO_URL: z.url({ protocol: /https?/ }).optional(),
		OAUTH_SCOPES: z
			.string()
			.min(1)
			.transform((value) => value.split(" "))
			.default(["openid", "profile", "email"]),

		// Email (SMTP)
		SMTP_HOST: z.string().min(1).optional(),
		SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
		SMTP_USER: z.string().min(1).optional(),
		SMTP_PASS: z.string().min(1).optional(),
		SMTP_FROM: z.string().min(1).optional(),
		SMTP_SECURE: z.stringbool().default(false),

		// Storage (Optional)
		LOCAL_STORAGE_PATH: z.string().min(1).refine(isAbsolute, "LOCAL_STORAGE_PATH must be an absolute path").optional(),
		S3_ACCESS_KEY_ID: z.string().min(1).optional(),
		S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		S3_REGION: z.string().default("us-east-1"),
		S3_ENDPOINT: z.url({ protocol: /https?/ }).optional(),
		S3_BUCKET: z.string().min(1).optional(),
		S3_FORCE_PATH_STYLE: z.stringbool().default(false),

		// AI Agent Workspace (optional until the agent feature is used)
		REDIS_URL: z.url({ protocol: /redis(s)?/ }).optional(),
		ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET must be at least 32 characters").optional(),

		// Parvagas integration (optional)
		PARVAGAS_RESUME_SYNC_ENABLED: z.stringbool().default(false),
		PARVAGAS_API_URL: z.url({ protocol: /https?/ }).optional(),
		PARVAGAS_API_KEY: z.string().min(1).optional(),
		PARVAGAS_SERVER_SECRET: z.string().min(1).optional(),
		PARVAGAS_MAIN_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt"),
		PARVAGAS_CANDIDATE_CV_URL: z.url({ protocol: /https?/ }).default("https://parvagas.pt/Portal/Candidato/CV-e-Documentos"),
		PARVAGAS_ALLOWED_RETURN_ORIGINS: z.string().default("https://parvagas.pt"),
		PARVAGAS_RESUME_SYNC_PATH: z.string().default("/api/v1/integrations/cv-builder/resumes/sync"),
		PARVAGAS_WEBHOOK_SECRET: z.string().min(1).optional(),
		PARVAGAS_AUTH_EXCHANGE_PATH: z.string().default("/api/v1/cv-builder/exchange"),
		PARVAGAS_AUTH_START_FALLBACK_URL: z.string().default("/Login?role=candidate"),

		// Feature Flags
		FLAG_DISABLE_SIGNUPS: z.stringbool().default(false),
		FLAG_DISABLE_EMAIL_AUTH: z.stringbool().default(false),
		FLAG_DISABLE_IMAGE_PROCESSING: z.stringbool().default(false),
		FLAG_DISABLE_API_RATE_LIMIT: z.stringbool().default(false),
		FLAG_SHOW_SPONSORS: z.stringbool().default(true),
		FLAG_ALLOW_UNSAFE_AI_BASE_URL: z.stringbool().default(false),
		FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: z.stringbool().default(false),

		// Crowdin (optional, for translation tooling)
		CROWDIN_PROJECT_ID: z.string().optional(),
		CROWDIN_API_TOKEN: z.string().optional(),
		GOOGLE_CLOUD_API_KEY: z.string().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
