import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { generateRandomName, slugify } from "@reactive-resume/utils/string";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "../../context";
import { resumeDto } from "../../dto/resume";
import {
	assertResumeCountWithinPlan,
	assertTemplateAllowed,
	getParvagasEntitlements,
} from "../../integrations/parvagas/entitlements";
import { buildResumeDataFromParvagasProfile, loadParvagasProfile } from "../../integrations/parvagas/profile-import";
import { retryParvagasResumeSync } from "../../integrations/parvagas/sync-service";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { syncResumeToParvagas } from "./parvagas-sync";
import { resumeService } from "./service";

export const crudRouter = {
	list: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes",
			tags: ["Resumes"],
			operationId: "listResumes",
			summary: "List all resumes",
			description:
				"Returns a list of all resumes belonging to the authenticated user. Results can be filtered by tags and sorted by last updated date, creation date, or name. Resume data is not included in the response for performance; use the get endpoint to fetch full resume data. Requires authentication.",
			successDescription: "A list of resumes with their metadata (without full resume data).",
		})
		.input(resumeDto.list.input.optional().default({ tags: [], sort: "lastUpdatedAt" }))
		.output(resumeDto.list.output)
		.handler(async ({ input, context }) => {
			return resumeService.list({
				userId: context.user.id,
				tags: input.tags,
				sort: input.sort,
			});
		}),

	getById: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/{id}",
			tags: ["Resumes"],
			operationId: "getResume",
			summary: "Get resume by ID",
			description:
				"Returns a single resume with its full data, identified by its unique ID. Only resumes belonging to the authenticated user can be retrieved. Requires authentication.",
			successDescription: "The resume with its full data.",
		})
		.input(resumeDto.getById.input)
		.output(resumeDto.getById.output)
		.handler(async ({ context, input }) => {
			return resumeService.getById({ id: input.id, userId: context.user.id });
		}),

	create: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes",
			tags: ["Resumes"],
			operationId: "createResume",
			summary: "Create a new resume",
			description:
				"Creates a new resume with the given name, slug, and tags. Optionally initializes the resume with sample data by setting withSampleData to true. The slug must be unique across the user's resumes. Returns the ID of the newly created resume. Requires authentication.",
			successDescription: "The ID of the newly created resume.",
		})
		.input(resumeDto.create.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.create.output)
		.errors({
			RESUME_SLUG_ALREADY_EXISTS: {
				message: "A resume with this slug already exists.",
				status: 400,
			},
		})
		.handler(async ({ context, input }) => {
			await assertResumeCountWithinPlan(context.user.id);

			const createdId = await resumeService.create({
				name: input.name,
				slug: input.slug,
				tags: input.tags,
				locale: context.locale,
				userId: context.user.id,
				...(input.withSampleData ? { data: sampleResumeData } : {}),
			});

			const created = await resumeService.getById({ id: createdId, userId: context.user.id });

			void syncResumeToParvagas({
				action: "create",
				userId: context.user.id,
				resumeId: createdId,
				resume: created,
			});

			return createdId;
		}),

	import: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes/import",
			tags: ["Resumes"],
			operationId: "importResume",
			summary: "Import a resume",
			description:
				"Creates a new resume from an existing ResumeData object (e.g. from a previously exported JSON file). A random name and slug are generated automatically. Returns the ID of the imported resume. Requires authentication.",
			successDescription: "The ID of the imported resume.",
		})
		.input(resumeDto.import.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.import.output)
		.errors({
			RESUME_SLUG_ALREADY_EXISTS: {
				message: "A resume with this slug already exists.",
				status: 400,
			},
		})
		.handler(async ({ context, input }) => {
			await assertResumeCountWithinPlan(context.user.id);
			const name = generateRandomName();
			const slug = slugify(name);

			const importedId = await resumeService.create({
				name,
				slug,
				tags: [],
				data: input.data,
				locale: context.locale,
				userId: context.user.id,
			});
			const imported = await resumeService.getById({ id: importedId, userId: context.user.id });

			void syncResumeToParvagas({
				action: "import",
				userId: context.user.id,
				resumeId: importedId,
				resume: imported,
			});

			return importedId;
		}),

	profilePreview: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/parvagas/profile",
			tags: ["Resumes"],
			operationId: "getParvagasProfileForResumeImport",
			summary: "Get Parvagas profile preview",
			description:
				"Loads the authenticated Parvagas profile mapped for CV import preview, including stable source IDs for section selection.",
			successDescription: "A normalized Parvagas profile preview payload for resume import.",
		})
		.input(resumeDto.profilePreview.input)
		.output(resumeDto.profilePreview.output)
		.handler(async ({ context }) => {
			return loadParvagasProfile(context.user.id);
		}),

	createFromParvagasProfile: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes/parvagas/import",
			tags: ["Resumes"],
			operationId: "createResumeFromParvagasProfile",
			summary: "Create resume from Parvagas profile",
			description:
				"Creates a new resume from the authenticated Parvagas profile using selected sections and stores import source metadata for future comparison.",
			successDescription: "The ID of the imported resume.",
		})
		.input(resumeDto.createFromParvagasProfile.input)
		.output(resumeDto.createFromParvagasProfile.output)
		.handler(async ({ context, input }) => {
			await assertResumeCountWithinPlan(context.user.id);
			const profile = await loadParvagasProfile(context.user.id);
			const mappedData = buildResumeDataFromParvagasProfile(profile, input.selection);

			if (mappedData.metadata.template) {
				const entitlements = await getParvagasEntitlements(context.user.id);
				assertTemplateAllowed(entitlements, mappedData.metadata.template);
			}

			const createdId = await resumeService.create({
				name: input.name,
				slug: input.slug,
				tags: input.tags,
				data: mappedData,
				locale: context.locale,
				userId: context.user.id,
			});

			const created = await resumeService.getById({ id: createdId, userId: context.user.id });
			void syncResumeToParvagas({
				action: "create",
				userId: context.user.id,
				resumeId: createdId,
				resume: created,
			});

			return createdId;
		}),

	update: protectedProcedure
		.route({
			method: "PUT",
			path: "/resumes/{id}",
			tags: ["Resumes"],
			operationId: "updateResume",
			summary: "Update a resume",
			description:
				"Updates one or more fields of a resume identified by its ID. All fields are optional; only provided fields will be updated. Locked resumes cannot be updated. Requires authentication.",
			successDescription: "The updated resume with its full data.",
		})
		.input(resumeDto.update.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.update.output)
		.errors({
			RESUME_SLUG_ALREADY_EXISTS: {
				message: "A resume with this slug already exists.",
				status: 400,
			},
		})
		.handler(async ({ context, input }) => {
			if (input.data?.metadata?.template) {
				const entitlements = await getParvagasEntitlements(context.user.id);
				assertTemplateAllowed(entitlements, input.data.metadata.template);
			}

			const updated = await resumeService.update({
				id: input.id,
				userId: context.user.id,
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.slug !== undefined ? { slug: input.slug } : {}),
				...(input.tags !== undefined ? { tags: input.tags } : {}),
				...(input.data !== undefined ? { data: input.data } : {}),
				...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
			});

			void syncResumeToParvagas({
				action: "update",
				userId: context.user.id,
				resumeId: updated.id,
				resume: updated,
			});

			return updated;
		}),

	patch: protectedProcedure
		.route({
			method: "PATCH",
			path: "/resumes/{id}",
			tags: ["Resumes"],
			operationId: "patchResume",
			summary: "Patch resume data",
			description:
				"Applies JSON Patch (RFC 6902) operations to partially update a resume's data. This allows small, targeted changes (e.g. updating a single field) without sending the entire resume object. Locked resumes cannot be patched. Requires authentication.",
			successDescription: "The patched resume with its full data.",
		})
		.input(resumeDto.patch.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.patch.output)
		.errors({
			INVALID_PATCH_OPERATIONS: {
				message: "The patch operations are invalid or produced an invalid resume.",
				status: 400,
			},
			RESUME_VERSION_CONFLICT: {
				message: "The resume changed after this patch was generated.",
				status: 409,
			},
		})
		.handler(async ({ context, input }) => {
			const patched = await resumeService.patch({
				id: input.id,
				userId: context.user.id,
				operations: input.operations,
				...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}),
			});

			void syncResumeToParvagas({
				action: "patch",
				userId: context.user.id,
				resumeId: patched.id,
				resume: patched,
			});

			return patched;
		}),

	setLocked: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes/{id}/lock",
			tags: ["Resumes"],
			operationId: "setResumeLocked",
			summary: "Set resume lock status",
			description:
				"Toggles the locked status of a resume. When locked, a resume cannot be updated, patched, or deleted. Useful for protecting finalized resumes from accidental edits. Requires authentication.",
			successDescription: "The resume lock status was updated successfully.",
		})
		.input(resumeDto.setLocked.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.setLocked.output)
		.handler(async ({ context, input }) => {
			return resumeService.setLocked({
				id: input.id,
				userId: context.user.id,
				isLocked: input.isLocked,
			});
		}),

	duplicate: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes/{id}/duplicate",
			tags: ["Resumes"],
			operationId: "duplicateResume",
			summary: "Duplicate a resume",
			description:
				"Creates a copy of an existing resume with the same data. Optionally override the name, slug, and tags for the duplicate. If not provided, the original resume's name, slug, and tags are used. Returns the ID of the duplicated resume. Requires authentication.",
			successDescription: "The ID of the duplicated resume.",
		})
		.input(resumeDto.duplicate.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.duplicate.output)
		.handler(async ({ context, input }) => {
			await assertResumeCountWithinPlan(context.user.id);
			const original = await resumeService.getById({ id: input.id, userId: context.user.id });

			const duplicatedId = await resumeService.create({
				userId: context.user.id,
				name: input.name ?? original.name,
				slug: input.slug ?? original.slug,
				tags: input.tags ?? original.tags,
				locale: context.locale,
				data: original.data,
			});
			const duplicated = await resumeService.getById({ id: duplicatedId, userId: context.user.id });

			void syncResumeToParvagas({
				action: "duplicate",
				userId: context.user.id,
				resumeId: duplicatedId,
				resume: duplicated,
			});

			return duplicatedId;
		}),

	delete: protectedProcedure
		.route({
			method: "DELETE",
			path: "/resumes/{id}",
			tags: ["Resumes"],
			operationId: "deleteResume",
			summary: "Delete a resume",
			description:
				"Permanently deletes a resume and its associated files (screenshots, PDFs) from storage. Locked resumes cannot be deleted; unlock the resume first. Requires authentication.",
			successDescription: "The resume and its associated files were deleted successfully.",
		})
		.input(resumeDto.delete.input)
		.use(resumeMutationRateLimit)
		.output(resumeDto.delete.output)
		.handler(async ({ context, input }) => {
			const deleted = await resumeService.delete({ id: input.id, userId: context.user.id });

			void syncResumeToParvagas({
				action: "delete",
				userId: context.user.id,
				resumeId: input.id,
			});

			return deleted;
		}),

	retrySync: protectedProcedure
		.route({
			method: "POST",
			path: "/resumes/{id}/sync/retry",
			tags: ["Resumes"],
			operationId: "retryResumeSync",
			summary: "Retry Parvagas resume sync",
			description:
				"Retries failed outbound resume sync events for the selected resume using persistent outbox state and exponential backoff metadata.",
			successDescription: "A summary of delivered, failed and pending sync events after retry.",
		})
		.input(resumeDto.retrySync.input)
		.output(resumeDto.retrySync.output)
		.handler(async ({ context, input }) => {
			const resume = await resumeService.getById({ id: input.id, userId: context.user.id });
			if (!resume) throw new ORPCError("NOT_FOUND");
			return retryParvagasResumeSync(context.user.id, input.id);
		}),
};
