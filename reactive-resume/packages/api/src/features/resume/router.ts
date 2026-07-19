import { analysisRouter } from "./analysis";
import { crudRouter } from "./crud";
import { updatesRouter } from "./event-router";
import { rewrite } from "./rewrite";
import { sharingRouter } from "./sharing";
import { resumeStatisticsRouter } from "./statistics";
import { tagsRouter } from "./tags";

export const resumeRouter = {
	tags: tagsRouter,
	statistics: resumeStatisticsRouter,
	analysis: analysisRouter,
	updates: updatesRouter,

	list: crudRouter.list,
	getById: crudRouter.getById,
	getBySlug: sharingRouter.getBySlug,
	create: crudRouter.create,
	import: crudRouter.import,
	profilePreview: crudRouter.profilePreview,
	createFromParvagasProfile: crudRouter.createFromParvagasProfile,
	update: crudRouter.update,
	patch: crudRouter.patch,
	setLocked: crudRouter.setLocked,
	setPassword: sharingRouter.setPassword,
	verifyPassword: sharingRouter.verifyPassword,
	removePassword: sharingRouter.removePassword,
	duplicate: crudRouter.duplicate,
	delete: crudRouter.delete,
	retrySync: crudRouter.retrySync,
	rewrite,
};
