-- Company tutorial, verification workflow and in-app notifications

create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_id on user_notifications ((payload->>'userId'));
create index if not exists idx_user_notifications_read on user_notifications ((payload->>'readAt'));
create index if not exists idx_user_notifications_type on user_notifications ((payload->>'type'));

create index if not exists idx_company_deletion_requests_company_id on company_deletion_requests ((payload->>'companyId'));
create index if not exists idx_company_deletion_requests_status on company_deletion_requests ((payload->>'status'));

create index if not exists idx_email_templates_key on email_templates ((payload->>'key'));
