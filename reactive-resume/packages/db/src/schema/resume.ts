import type { StoredResumeAnalysis } from "@reactive-resume/schema/resume/analysis";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import * as pg from "drizzle-orm/pg-core";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { generateId } from "@reactive-resume/utils/string";
import { user } from "./auth";

export const resume = pg.pgTable(
	"resume",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		name: pg.text("name").notNull(),
		slug: pg.text("slug").notNull(),
		tags: pg.text("tags").array().notNull().default([]),
		isPublic: pg.boolean("is_public").notNull().default(false),
		isLocked: pg.boolean("is_locked").notNull().default(false),
		password: pg.text("password"),
		data: pg
			.jsonb("data")
			.notNull()
			.$type<ResumeData>()
			.$defaultFn(() => defaultResumeData),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: pg
			.timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(t) => [
		pg.unique().on(t.slug, t.userId),
		pg.index().on(t.userId),
		pg.index().on(t.createdAt.asc()),
		pg.index().on(t.userId, t.updatedAt.desc()),
		pg.index().on(t.isPublic, t.slug, t.userId),
	],
);

export const resumeStatistics = pg.pgTable("resume_statistics", {
	id: pg
		.text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => generateId()),
	views: pg.integer("views").notNull().default(0),
	downloads: pg.integer("downloads").notNull().default(0),
	lastViewedAt: pg.timestamp("last_viewed_at", { withTimezone: true }),
	lastDownloadedAt: pg.timestamp("last_downloaded_at", { withTimezone: true }),
	resumeId: pg
		.text("resume_id")
		.unique()
		.notNull()
		.references(() => resume.id, { onDelete: "cascade" }),
	createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: pg
		.timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date()),
});

export const resumeAnalysis = pg.pgTable(
	"resume_analysis",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		analysis: pg.jsonb("analysis").notNull().$type<StoredResumeAnalysis>(),
		resumeId: pg
			.text("resume_id")
			.unique()
			.notNull()
			.references(() => resume.id, { onDelete: "cascade" }),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: pg
			.timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(t) => [pg.index().on(t.resumeId)],
);

export const parvagasResumeSyncOutbox = pg.pgTable(
	"parvagas_resume_sync_outbox",
	{
		id: pg
			.text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => generateId()),
		eventId: pg.text("event_id").notNull().unique(),
		eventType: pg.text("event_type").notNull(),
		status: pg.text("status").notNull().default("pending"),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		externalUserId: pg.text("external_user_id"),
		resumeId: pg
			.text("resume_id")
			.notNull()
			.references(() => resume.id, { onDelete: "cascade" }),
		resumeName: pg.text("resume_name").notNull(),
		resumeSlug: pg.text("resume_slug").notNull(),
		resumeVersion: pg.integer("resume_version").notNull().default(1),
		resumeUpdatedAt: pg.timestamp("resume_updated_at", { withTimezone: true }),
		resumeData: pg.jsonb("resume_data"),
		occurredAt: pg.timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
		nextAttemptAt: pg.timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
		lastAttemptAt: pg.timestamp("last_attempt_at", { withTimezone: true }),
		attemptCount: pg.integer("attempt_count").notNull().default(0),
		maxAttempts: pg.integer("max_attempts").notNull().default(8),
		lastError: pg.text("last_error"),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: pg
			.timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(t) => [
		pg.index().on(t.status, t.nextAttemptAt),
		pg.index().on(t.resumeId, t.createdAt.desc()),
		pg.index().on(t.userId, t.createdAt.desc()),
	],
);
