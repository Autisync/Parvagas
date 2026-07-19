import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import {
	parvagasEntitlementsResponseSchema,
	parvagasProfileResponseSchema,
	type ParvagasEntitlementsResponse,
	type ParvagasProfileResponse,
} from "./schemas";

const DEFAULT_SYNC_PATH = "/api/v1/integrations/cv-builder/resumes/sync";
const PROFILE_PATH = "/api/v1/integrations/cv-builder/profile";
const ENTITLEMENTS_PATH = "/api/v1/integrations/cv-builder/entitlements";

export function resolveParvagasApiUrl(path: string) {
	if (!env.PARVAGAS_API_URL) return null;

	const base = env.PARVAGAS_API_URL.replace(/\/+$/, "");
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalizedPath}`;
}

export function resolveParvagasSyncUrl() {
	return resolveParvagasApiUrl(env.PARVAGAS_RESUME_SYNC_PATH || DEFAULT_SYNC_PATH);
}

export async function resolveExternalUserId(userId: string) {
	const [account] = await db
		.select({
			accountId: schema.account.accountId,
			providerId: schema.account.providerId,
			createdAt: schema.account.createdAt,
		})
		.from(schema.account)
		.where(
			and(
				eq(schema.account.userId, userId),
				inArray(schema.account.providerId, ["custom", "oidc", "parvagas", "openid"]),
			),
		)
		.orderBy(desc(schema.account.createdAt))
		.limit(1);

	if (account?.accountId) return account.accountId;
	return userId;
}

export async function createParvagasHeaders(userId: string) {
	const externalUserId = await resolveExternalUserId(userId);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-Source": "parvagas-cv-builder",
		"X-Parvagas-User-Id": externalUserId,
	};

	if (env.PARVAGAS_API_KEY) headers.Authorization = `Bearer ${env.PARVAGAS_API_KEY}`;

	return { headers, externalUserId };
}

export async function fetchParvagasProfile(userId: string): Promise<ParvagasProfileResponse> {
	const url = resolveParvagasApiUrl(PROFILE_PATH);
	if (!url) throw new Error("PARVAGAS_API_URL is not configured");

	const { headers } = await createParvagasHeaders(userId);
	const response = await fetch(url, { method: "GET", headers });
	if (!response.ok) throw new Error(`Failed to fetch Parvagas profile: HTTP ${response.status}`);

	const payload = await response.json();
	return parvagasProfileResponseSchema.parse(payload);
}

export async function fetchParvagasEntitlements(userId: string): Promise<ParvagasEntitlementsResponse> {
	const url = resolveParvagasApiUrl(ENTITLEMENTS_PATH);
	if (!url) throw new Error("PARVAGAS_API_URL is not configured");

	const { headers } = await createParvagasHeaders(userId);
	const response = await fetch(url, { method: "GET", headers });
	if (!response.ok) throw new Error(`Failed to fetch Parvagas entitlements: HTTP ${response.status}`);

	const payload = await response.json();
	return parvagasEntitlementsResponseSchema.parse(payload);
}
