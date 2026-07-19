import z from "zod";

export const parvagasProfileSectionSchema = z.object({
	id: z.string().min(1),
});

export const parvagasProfileBasicsSchema = z.object({
	name: z.string().catch(""),
	email: z.string().catch(""),
	phone: z.string().catch(""),
	location: z.string().catch(""),
	website: z.string().catch(""),
	linkedin: z.string().catch(""),
	github: z.string().catch(""),
	portfolio: z.string().catch(""),
});

export const parvagasProfileExperienceSchema = parvagasProfileSectionSchema.extend({
	company: z.string().catch(""),
	position: z.string().catch(""),
	location: z.string().catch(""),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	current: z.boolean().default(false),
	summary: z.string().catch(""),
	highlights: z.array(z.string()).catch([]),
});

export const parvagasProfileEducationSchema = parvagasProfileSectionSchema.extend({
	institution: z.string().catch(""),
	area: z.string().catch(""),
	studyType: z.string().catch(""),
	score: z.string().catch(""),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	current: z.boolean().default(false),
	summary: z.string().catch(""),
});

export const parvagasProfileSkillSchema = parvagasProfileSectionSchema.extend({
	name: z.string().catch(""),
	level: z.number().min(0).max(5).default(0),
	keywords: z.array(z.string()).catch([]),
});

export const parvagasProfileLanguageSchema = parvagasProfileSectionSchema.extend({
	name: z.string().catch(""),
	fluency: z.string().catch(""),
});

export const parvagasProfileCertificationSchema = parvagasProfileSectionSchema.extend({
	name: z.string().catch(""),
	issuer: z.string().catch(""),
	date: z.string().optional(),
	url: z.string().catch(""),
	summary: z.string().catch(""),
});

export const parvagasProfileProjectSchema = parvagasProfileSectionSchema.extend({
	name: z.string().catch(""),
	description: z.string().catch(""),
	url: z.string().catch(""),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	highlights: z.array(z.string()).catch([]),
});

export const parvagasProfileLinkSchema = parvagasProfileSectionSchema.extend({
	network: z.string().catch(""),
	username: z.string().catch(""),
	url: z.string().catch(""),
});

export const parvagasProfileResponseSchema = z.object({
	externalUserId: z.string().min(1),
	basics: parvagasProfileBasicsSchema,
	summary: z.string().catch(""),
	experience: z.array(parvagasProfileExperienceSchema).catch([]),
	education: z.array(parvagasProfileEducationSchema).catch([]),
	skills: z.array(parvagasProfileSkillSchema).catch([]),
	languages: z.array(parvagasProfileLanguageSchema).catch([]),
	certifications: z.array(parvagasProfileCertificationSchema).catch([]),
	projects: z.array(parvagasProfileProjectSchema).catch([]),
	links: z.array(parvagasProfileLinkSchema).catch([]),
});

export type ParvagasProfileResponse = z.infer<typeof parvagasProfileResponseSchema>;

export const parvagasEntitlementsResponseSchema = z.object({
	plan: z.enum(["free", "pro", "premium"]),
	status: z.enum(["active", "pending", "expired", "suspended"]),
	expires_at: z.string().nullable(),
	limits: z.object({
		resumes: z.number().int().nullable(),
		ai_requests_monthly: z.number().int().nullable(),
		exports_monthly: z.number().int().nullable(),
		cover_letters: z.boolean(),
		premium_templates: z.boolean(),
		version_history: z.boolean(),
	}),
});

export type ParvagasEntitlementsResponse = z.infer<typeof parvagasEntitlementsResponseSchema>;

export const parvagasSectionSelectionSchema = z.object({
	basics: z.boolean().default(true),
	summary: z.boolean().default(true),
	experience: z.boolean().default(true),
	education: z.boolean().default(true),
	skills: z.boolean().default(true),
	languages: z.boolean().default(true),
	certifications: z.boolean().default(true),
	projects: z.boolean().default(true),
	links: z.boolean().default(true),
});

export type ParvagasSectionSelection = z.infer<typeof parvagasSectionSelectionSchema>;
