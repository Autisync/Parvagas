import { JobStatuses, canTransitionJobStatus } from "./jobWorkflowService.js";

export const applyJobModeration = (job, { status, visibility, reason } = {}) => {
  if (status) {
    const normalizedStatus = String(status).trim();
    if (!canTransitionJobStatus(job.status, normalizedStatus)) {
      throw new Error(`Transição inválida de ${job.status || "(vazio)"} para ${normalizedStatus}.`);
    }
    if (
      job.status === JobStatuses.PENDING_COMPANY_APPROVAL &&
      ![JobStatuses.PENDING_PLATFORM_REVIEW, JobStatuses.ARCHIVED].includes(normalizedStatus)
    ) {
      throw new Error("Aprovação interna da empresa deve ser feita pelo gestor da empresa.");
    }
    job.status = normalizedStatus;
  }

  if (visibility) job.visibility = visibility;
  if (reason) job.platformModerationReason = String(reason).trim();
  return job;
};