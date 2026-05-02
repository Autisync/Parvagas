-- Admin analytics performance indexes for created_at time-window queries.

create index if not exists idx_users_created_at on users (created_at);
create index if not exists idx_companies_created_at on companies (created_at);
create index if not exists idx_jobs_created_at on jobs (created_at);
create index if not exists idx_applications_created_at on applications (created_at);
create index if not exists idx_ad_campaigns_created_at on ad_campaigns (created_at);

-- JSON payload filter indexes frequently used by analytics distributions.
create index if not exists idx_jobs_status_payload on jobs ((payload->>'status'));
create index if not exists idx_companies_verification_status_payload on companies ((payload->>'verificationStatus'));
create index if not exists idx_applications_status_payload on applications ((payload->>'status'));
create index if not exists idx_users_suspended_payload on users ((payload->>'suspended'));
