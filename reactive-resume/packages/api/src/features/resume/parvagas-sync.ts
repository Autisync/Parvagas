import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { queueParvagasResumeSync } from "../../integrations/parvagas/sync-service";

type ResumeSyncAction = "create" | "update" | "patch" | "import" | "duplicate" | "delete";

type ResumeSyncPayload = {
	action: ResumeSyncAction;
	userId: string;
	resumeId: string;
	resume?: {
		id?: string;
		name?: string;
		slug?: string;
		data?: ResumeData;
		updatedAt?: Date;
	};
};

export async function syncResumeToParvagas(payload: ResumeSyncPayload) {
	const resumeName = payload.resume?.name ?? "Curriculum Vitae";
	const resumeSlug = payload.resume?.slug ?? payload.resumeId;

	await queueParvagasResumeSync({
		action: payload.action,
		userId: payload.userId,
		resume: {
			id: payload.resumeId,
			name: resumeName,
			slug: resumeSlug,
			...(payload.resume?.data ? { data: payload.resume.data } : {}),
			...(payload.resume?.updatedAt ? { updatedAt: payload.resume.updatedAt } : {}),
		},
	});
}
