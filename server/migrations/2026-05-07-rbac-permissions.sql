-- RBAC permissions baseline for dynamic role mapping
-- This migration keeps permission codes queryable in SQL while backend enforcement
-- remains code-driven through hasPermission(...).

create table if not exists permissions (
  code text primary key,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role text not null,
  permission_code text not null references permissions(code) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role, permission_code)
);

create index if not exists idx_role_permissions_role on role_permissions(role);
create index if not exists idx_role_permissions_permission on role_permissions(permission_code);

insert into permissions (code, description)
values
  ('job.review', 'View jobs pending moderation review'),
  ('job.approve', 'Approve job postings'),
  ('job.reject', 'Reject job postings'),
  ('ad.flag', 'Flag suspicious ads or jobs for follow-up'),
  ('ad.pause', 'Pause problematic ad campaigns'),
  ('ad.draft', 'Create and manage draft ad campaigns'),
  ('ad.publish', 'Publish ad campaigns to active state')
on conflict (code) do update set
  description = excluded.description,
  updated_at = now();

insert into role_permissions (role, permission_code, granted)
values
  ('moderator', 'job.review', true),
  ('moderator', 'job.approve', true),
  ('moderator', 'job.reject', true),
  ('moderator', 'ad.flag', true),
  ('moderator', 'ad.pause', true),
  ('moderator', 'ad.draft', true)
on conflict (role, permission_code) do update set
  granted = true,
  updated_at = now();

-- Moderators must not publish ads by default.
delete from role_permissions where role = 'moderator' and permission_code = 'ad.publish';
