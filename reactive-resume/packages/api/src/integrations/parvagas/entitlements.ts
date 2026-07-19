import { and, eq, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { fetchParvagasEntitlements } from "./client";
import type { ParvagasEntitlementsResponse } from "./schemas";

type CachedEntitlement = {
	value: ParvagasEntitlementsResponse;
	expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const entitlementCache = new Map<string, CachedEntitlement>();

const safeDefaultEntitlements: ParvagasEntitlementsResponse = {
	plan: "free",
	status: "active",
	expires_at: null,
	limits: {
		resumes: 3,
		ai_requests_monthly: 0,
		exports_monthly: 10,
		cover_letters: false,
		premium_templates: false,
		version_history: false,
	},
};

export async function getParvagasEntitlements(userId: string): Promise<ParvagasEntitlementsResponse> {
	if (!env.PARVAGAS_API_URL) return safeDefaultEntitlements;

	const now = Date.now();
	const cached = entitlementCache.get(userId);
	if (cached && cached.expiresAt > now) return cached.value;

	try {
		const value = await fetchParvagasEntitlements(userId);
		entitlementCache.set(userId, { value, expiresAt: now + CACHE_TTL_MS });
		return value;
	} catch {
		return safeDefaultEntitlements;
	}
}

export async function assertResumeCountWithinPlan(userId: string) {
	const entitlements = await getParvagasEntitlements(userId);
	const resumeLimit = entitlements.limits.resumes;
	if (resumeLimit === null) return;

	const [summary] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.resume)
		.where(eq(schema.resume.userId, userId));

	if ((summary?.count ?? 0) >= resumeLimit) {
		throw new Error("Parvagas entitlement denied: resume limit reached");
	}
}

export function assertTemplateAllowed(entitlements: ParvagasEntitlementsResponse, template: string) {
	const freeTemplates = new Set(["onyx", "evenor", "gengar"]);
	if (freeTemplates.has(template)) return;
	if (entitlements.limits.premium_templates) return;
	throw new Error("Parvagas entitlement denied: premium template requires Pro/Premium plan");
}

export async function assertAiRequestsAllowed(userId: string) {
	const entitlements = await getParvagasEntitlements(userId);
	if (entitlements.limits.ai_requests_monthly === null) return;
	if (entitlements.limits.ai_requests_monthly <= 0) {
		throw new Error("Parvagas entitlement denied: AI requests not available on current plan");
	}
}

export async function assertExportAllowed(userId: string, resumeId: string) {
	const entitlements = await getParvagasEntitlements(userId);
	const limit = entitlements.limits.exports_monthly;
	if (limit === null) return;

	const [summary] = await db
		.select({ downloads: sql<number>`coalesce(sum(${schema.resumeStatistics.downloads}), 0)` })
		.from(schema.resumeStatistics)
		.innerJoin(schema.resume, and(eq(schema.resume.id, schema.resumeStatistics.resumeId), eq(schema.resume.userId, userId)))
		.where(eq(schema.resume.id, resumeId));

	if ((summary?.downloads ?? 0) >= limit) {
		throw new Error("Parvagas entitlement denied: export quota exceeded");
	}
}

export async function assertVersionHistoryAllowed(userId: string) {
	const entitlements = await getParvagasEntitlements(userId);
	if (entitlements.limits.version_history) return;
	throw new Error("Parvagas entitlement denied: version history requires Premium plan");
}
