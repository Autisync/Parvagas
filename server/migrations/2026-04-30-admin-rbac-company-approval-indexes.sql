-- Admin RBAC + company approval workflow indexes

create index if not exists idx_jobs_status_v2 on jobs ((payload->>'status'));
create index if not exists idx_jobs_company_id on jobs ((payload->>'companyId'));
create index if not exists idx_jobs_assigned_company_reviewer on jobs ((payload->>'assignedCompanyReviewerId'));
create index if not exists idx_jobs_company_approval_requested_at on jobs ((payload->>'companyApprovalRequestedAt'));
create index if not exists idx_jobs_created_by_user_id on jobs ((payload->>'createdByUserId'));

create index if not exists idx_companies_verification_status_v2 on companies ((payload->>'verificationStatus'));

create index if not exists idx_admin_actions_admin_user_id on admin_actions ((payload->>'adminUserId'));
create index if not exists idx_admin_actions_created_at on admin_actions (created_at desc);

create index if not exists idx_audit_logs_actor_user_id on audit_logs ((payload->>'actorUserId'));
create index if not exists idx_audit_logs_action on audit_logs ((payload->>'action'));
create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);
