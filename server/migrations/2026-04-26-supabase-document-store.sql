-- Supabase/Postgres bootstrap for Parvagas document-store migration
-- Run this in Supabase SQL editor before starting the API.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_invites (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_parse_runs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_documents (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists career_posts (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_alerts (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_match_scores (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saved_jobs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scraped_jobs (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes for current API filters
create index if not exists idx_users_email on users ((payload->>'email'));
create index if not exists idx_jobs_visibility on jobs ((payload->>'visibility'));
create index if not exists idx_jobs_status on jobs ((payload->>'status'));
create index if not exists idx_company_invites_company_id on company_invites ((payload->>'companyId'));
create index if not exists idx_company_invites_email on company_invites ((payload->>'email'));
create index if not exists idx_company_invites_token on company_invites ((payload->>'token'));
create index if not exists idx_ad_campaigns_active on ad_campaigns ((payload->>'active'));
create index if not exists idx_candidate_profiles_user_id on candidate_profiles ((payload->>'userId'));
create index if not exists idx_career_posts_slug on career_posts ((payload->>'slug'));
create index if not exists idx_career_posts_status on career_posts ((payload->>'status'));
create index if not exists idx_applications_candidate_user_id on applications ((payload->>'candidateUserId'));
create index if not exists idx_applications_company_id on applications ((payload->>'companyId'));
