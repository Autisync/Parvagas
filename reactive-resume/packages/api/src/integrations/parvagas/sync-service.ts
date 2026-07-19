import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { createHmac, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { createParvagasHeaders, resolveExternalUserId, resolveParvagasSyncUrl } from "./client";

type ResumeSyncAction = "create" | "update" | "patch" | "import" | "duplicate" | "delete";
type OutboxStatus = "pending" | "processing" | "delivered" | "failed" | "dead_letter";

export type ResumeSnapshot = {
	id: string;
	name: string;
	slug: string;
	data?: ResumeData;
	updatedAt?: Date;
};

type SyncEventType = "resume.created" | "resume.updated" | "resume.deleted";

const MAX_ATTEMPTS = 8;
const DEBOUNCE_WINDOW_SECONDS = 8;

export const mapActionToEventType = (action: ResumeSyncAction): SyncEventType =>
	action === "delete" ? "resume.deleted" : action === "create" || action === "import" || action === "duplicate"
		? "resume.created"
		: "resume.updated";

const computeResumeVersion = (updatedAt?: Date) => {
	if (!updatedAt) return 1;
	return Math.max(1, Math.floor(updatedAt.getTime() / 1000));
};

export const computeBackoffSeconds = (attemptCount: number) => {
	const base = 30;
	const exponent = Math.max(0, attemptCount - 1);
	return Math.min(1800, base * 2 ** exponent);
};

export const toSignature = (secret: string, timestamp: string, rawBody: string) => {
	const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
	return `sha256=${digest}`;
};

async function getLatestDebounceCandidate(userId: string, resumeId: string, eventType: SyncEventType) {
	const [record] = await db
		.select()
		.from(schema.parvagasResumeSyncOutbox)
		.where(
			and(
				eq(schema.parvagasResumeSyncOutbox.userId, userId),
				eq(schema.parvagasResumeSyncOutbox.resumeId, resumeId),
				eq(schema.parvagasResumeSyncOutbox.eventType, eventType),
				inArray(schema.parvagasResumeSyncOutbox.status, ["pending", "failed"]),
			),
		)
		.orderBy(desc(schema.parvagasResumeSyncOutbox.createdAt))
		.limit(1);

	return record;
}

async function upsertDebouncedEvent(input: {
	eventType: SyncEventType;
	userId: string;
	resume: ResumeSnapshot;
	externalUserId: string;
}) {
	const candidate = await getLatestDebounceCandidate(input.userId, input.resume.id, input.eventType);
	const now = new Date();
	const resumeVersion = computeResumeVersion(input.resume.updatedAt);
	const debounceThreshold = new Date(now.getTime() - DEBOUNCE_WINDOW_SECONDS * 1000);

	if (
		candidate &&
		candidate.createdAt > debounceThreshold &&
		input.eventType === "resume.updated"
	) {
		await db
			.update(schema.parvagasResumeSyncOutbox)
			.set({
				status: "pending",
				externalUserId: input.externalUserId,
				resumeName: input.resume.name,
				resumeSlug: input.resume.slug,
				resumeVersion,
				resumeUpdatedAt: input.resume.updatedAt,
				resumeData: input.resume.data,
				occurredAt: now,
				nextAttemptAt: now,
				lastError: null,
			})
			.where(eq(schema.parvagasResumeSyncOutbox.id, candidate.id));

		return candidate.eventId;
	}

	const eventId = randomUUID();
	await db.insert(schema.parvagasResumeSyncOutbox).values({
		eventId,
		eventType: input.eventType,
		status: "pending",
		userId: input.userId,
		externalUserId: input.externalUserId,
		resumeId: input.resume.id,
		resumeName: input.resume.name,
		resumeSlug: input.resume.slug,
		resumeVersion,
		resumeUpdatedAt: input.resume.updatedAt,
		resumeData: input.resume.data,
		occurredAt: now,
		nextAttemptAt: now,
		maxAttempts: MAX_ATTEMPTS,
	});

	return eventId;
}

async function markDeliveryResult(input: {
	id: string;
	status: OutboxStatus;
	lastError?: string;
	attemptCount?: number;
	nextAttemptAt?: Date;
}) {
	await db
		.update(schema.parvagasResumeSyncOutbox)
		.set({
			status: input.status,
			lastError: input.lastError ?? null,
			lastAttemptAt: new Date(),
			attemptCount: input.attemptCount ?? sql`${schema.parvagasResumeSyncOutbox.attemptCount}`,
			nextAttemptAt: input.nextAttemptAt ?? sql`${schema.parvagasResumeSyncOutbox.nextAttemptAt}`,
		})
		.where(eq(schema.parvagasResumeSyncOutbox.id, input.id));
}

async function deliverOutboxEvent(event: typeof schema.parvagasResumeSyncOutbox.$inferSelect) {
	const url = resolveParvagasSyncUrl();
	if (!url) throw new Error("PARVAGAS_API_URL is not configured");

	const { headers } = await createParvagasHeaders(event.userId);
	const occurredAtIso = event.occurredAt.toISOString();
	const updatedAtIso = (event.resumeUpdatedAt ?? event.occurredAt).toISOString();
	const payload = {
		event_id: event.eventId,
		event_type: event.eventType,
		occurred_at: occurredAtIso,
		source: "parvagas-cv-builder",
		user: {
			external_user_id: event.externalUserId ?? event.userId,
		},
		resume: {
			external_resume_id: event.resumeId,
			name: event.resumeName,
			slug: event.resumeSlug,
			version: event.resumeVersion,
			updated_at: updatedAtIso,
			data: event.eventType === "resume.deleted" ? {} : (event.resumeData ?? {}),
		},
	};
	const rawBody = JSON.stringify(payload);

	const timestamp = Math.floor(Date.now() / 1000).toString();
	headers["X-Parvagas-Timestamp"] = timestamp;
	headers["X-Parvagas-Event-Id"] = event.eventId;

	if (env.PARVAGAS_WEBHOOK_SECRET) {
		headers["X-Parvagas-Signature"] = toSignature(env.PARVAGAS_WEBHOOK_SECRET, timestamp, rawBody);
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: rawBody,
	});

	if (!response.ok) {
		throw new Error(`Sync request failed with HTTP ${response.status}`);
	}
}

export async function processParvagasSyncOutbox(options?: { userId?: string; resumeId?: string; limit?: number }) {
	if (!env.PARVAGAS_RESUME_SYNC_ENABLED) return { delivered: 0, failed: 0, pending: 0 };

	const now = new Date();
	const records = await db
		.select()
		.from(schema.parvagasResumeSyncOutbox)
		.where(
			and(
				inArray(schema.parvagasResumeSyncOutbox.status, ["pending", "failed"]),
				lte(schema.parvagasResumeSyncOutbox.nextAttemptAt, now),
				...(options?.userId ? [eq(schema.parvagasResumeSyncOutbox.userId, options.userId)] : []),
				...(options?.resumeId ? [eq(schema.parvagasResumeSyncOutbox.resumeId, options.resumeId)] : []),
			),
		)
		.orderBy(asc(schema.parvagasResumeSyncOutbox.nextAttemptAt))
		.limit(options?.limit ?? 25);

	let delivered = 0;
	let failed = 0;
	for (const record of records) {
		const nextAttemptCount = record.attemptCount + 1;
		await db
			.update(schema.parvagasResumeSyncOutbox)
			.set({
				status: "processing",
				lastAttemptAt: now,
				attemptCount: nextAttemptCount,
			})
			.where(eq(schema.parvagasResumeSyncOutbox.id, record.id));

		try {
			await deliverOutboxEvent({ ...record, attemptCount: nextAttemptCount });
			await markDeliveryResult({
				id: record.id,
				status: "delivered",
				attemptCount: nextAttemptCount,
				nextAttemptAt: now,
			});
			delivered += 1;
		} catch (error) {
			const terminal = nextAttemptCount >= record.maxAttempts;
			const backoffSeconds = computeBackoffSeconds(nextAttemptCount);
			const nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
			await markDeliveryResult({
				id: record.id,
				status: terminal ? "dead_letter" : "failed",
				lastError: error instanceof Error ? error.message : "Unknown sync error",
				attemptCount: nextAttemptCount,
				nextAttemptAt,
			});
			failed += 1;
		}
	}

	const [pendingSummary] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.parvagasResumeSyncOutbox)
		.where(inArray(schema.parvagasResumeSyncOutbox.status, ["pending", "failed", "processing"]));

	return { delivered, failed, pending: pendingSummary?.count ?? 0 };
}

export async function queueParvagasResumeSync(input: {
	action: ResumeSyncAction;
	userId: string;
	resume: ResumeSnapshot;
}) {
	if (!env.PARVAGAS_RESUME_SYNC_ENABLED) return;
	if (!env.PARVAGAS_API_URL) return;

	const externalUserId = await resolveExternalUserId(input.userId);
	const eventType = mapActionToEventType(input.action);
	await upsertDebouncedEvent({
		eventType,
		userId: input.userId,
		resume: input.resume,
		externalUserId,
	});

	await processParvagasSyncOutbox({ userId: input.userId, resumeId: input.resume.id, limit: 10 });
}

export async function retryParvagasResumeSync(userId: string, resumeId: string) {
	await db
		.update(schema.parvagasResumeSyncOutbox)
		.set({
			status: "pending",
			nextAttemptAt: new Date(),
			lastError: null,
		})
		.where(
			and(
				eq(schema.parvagasResumeSyncOutbox.userId, userId),
				eq(schema.parvagasResumeSyncOutbox.resumeId, resumeId),
				inArray(schema.parvagasResumeSyncOutbox.status, ["failed", "dead_letter"]),
			),
		);

	return processParvagasSyncOutbox({ userId, resumeId, limit: 10 });
}
