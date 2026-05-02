-- Candidate portal hardening: generated CV profiles and candidate data indexes

create table if not exists generated_cv_profiles (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generated_cv_profiles_user_id on generated_cv_profiles ((payload->>'userId'));
create index if not exists idx_generated_cv_profiles_target_field on generated_cv_profiles ((payload->>'targetField'));
create index if not exists idx_candidate_documents_user_id on candidate_documents ((payload->>'userId'));
create index if not exists idx_saved_jobs_user_id on saved_jobs ((payload->>'userId'));
create index if not exists idx_job_alerts_user_id on job_alerts ((payload->>'userId'));
create index if not exists idx_notification_preferences_user_id on notification_preferences ((payload->>'userId'));
