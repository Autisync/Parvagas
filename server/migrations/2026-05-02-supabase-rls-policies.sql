-- Parvagas RLS hardening for direct Supabase access.
-- The Express backend uses the service role and therefore bypasses RLS by design.
-- These policies protect future direct clients, dashboards, and edge functions that
-- use JWT claims compatible with Parvagas tokens.

create schema if not exists app_public;

create or replace function app_public.request_claim(claim text)
returns text
language sql
stable
as $$
  select nullif(coalesce(
    auth.jwt() ->> claim,
    (current_setting('request.jwt.claims', true)::jsonb ->> claim)
  ), '');
$$;

create or replace function app_public.request_user_id()
returns text
language sql
stable
as $$
  select coalesce(app_public.request_claim('id'), app_public.request_claim('sub'));
$$;

create or replace function app_public.request_role()
returns text
language sql
stable
as $$
  select lower(coalesce(app_public.request_claim('role'), ''));
$$;

create or replace function app_public.request_company_id()
returns text
language sql
stable
as $$
  select app_public.request_claim('companyId');
$$;

create or replace function app_public.request_admin_level()
returns text
language sql
stable
as $$
  select lower(coalesce(app_public.request_claim('adminLevel'), ''));
$$;

create or replace function app_public.is_admin()
returns boolean
language sql
stable
as $$
  select app_public.request_role() = 'admin';
$$;

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.candidate_documents enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.job_alerts enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_logs enable row level security;

drop policy if exists users_self_or_admin_select on public.users;
create policy users_self_or_admin_select on public.users
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = coalesce(payload ->> 'id', payload ->> '_id', payload ->> 'userId')
);

drop policy if exists companies_owner_or_admin_select on public.companies;
create policy companies_owner_or_admin_select on public.companies
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_company_id() = id::text
  or app_public.request_user_id() = (payload ->> 'ownerUserId')
);

drop policy if exists companies_owner_or_admin_update on public.companies;
create policy companies_owner_or_admin_update on public.companies
for update to authenticated
using (
  app_public.is_admin()
  or app_public.request_company_id() = id::text
  or app_public.request_user_id() = (payload ->> 'ownerUserId')
)
with check (
  app_public.is_admin()
  or app_public.request_company_id() = id::text
  or app_public.request_user_id() = (payload ->> 'ownerUserId')
);

drop policy if exists jobs_public_or_scoped_select on public.jobs;
create policy jobs_public_or_scoped_select on public.jobs
for select to authenticated
using (
  coalesce(payload ->> 'visibility', '') = 'public'
  or app_public.is_admin()
  or app_public.request_company_id() = (payload ->> 'companyId')
);

drop policy if exists jobs_company_or_admin_update on public.jobs;
create policy jobs_company_or_admin_update on public.jobs
for update to authenticated
using (
  app_public.is_admin()
  or app_public.request_company_id() = (payload ->> 'companyId')
)
with check (
  app_public.is_admin()
  or app_public.request_company_id() = (payload ->> 'companyId')
);

drop policy if exists applications_owner_company_admin_select on public.applications;
create policy applications_owner_company_admin_select on public.applications
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'candidateUserId')
  or app_public.request_company_id() = (payload ->> 'companyId')
);

drop policy if exists applications_candidate_insert on public.applications;
create policy applications_candidate_insert on public.applications
for insert to authenticated
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'candidateUserId')
);

drop policy if exists applications_owner_company_admin_update on public.applications;
create policy applications_owner_company_admin_update on public.applications
for update to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'candidateUserId')
  or app_public.request_company_id() = (payload ->> 'companyId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'candidateUserId')
  or app_public.request_company_id() = (payload ->> 'companyId')
);

drop policy if exists candidate_profiles_owner_or_admin_select on public.candidate_profiles;
create policy candidate_profiles_owner_or_admin_select on public.candidate_profiles
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists candidate_profiles_owner_or_admin_update on public.candidate_profiles;
create policy candidate_profiles_owner_or_admin_update on public.candidate_profiles
for update to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists candidate_documents_owner_or_admin_select on public.candidate_documents;
create policy candidate_documents_owner_or_admin_select on public.candidate_documents
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists candidate_documents_owner_or_admin_insert on public.candidate_documents;
create policy candidate_documents_owner_or_admin_insert on public.candidate_documents
for insert to authenticated
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists candidate_documents_owner_or_admin_update on public.candidate_documents;
create policy candidate_documents_owner_or_admin_update on public.candidate_documents
for update to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists saved_jobs_owner_or_admin_all on public.saved_jobs;
create policy saved_jobs_owner_or_admin_all on public.saved_jobs
for all to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists job_alerts_owner_or_admin_all on public.job_alerts;
create policy job_alerts_owner_or_admin_all on public.job_alerts
for all to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists notification_preferences_owner_or_admin_all on public.notification_preferences;
create policy notification_preferences_owner_or_admin_all on public.notification_preferences
for all to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
)
with check (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);

drop policy if exists notification_logs_owner_or_admin_select on public.notification_logs;
create policy notification_logs_owner_or_admin_select on public.notification_logs
for select to authenticated
using (
  app_public.is_admin()
  or app_public.request_user_id() = (payload ->> 'userId')
);