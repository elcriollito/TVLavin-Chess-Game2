-- CAISSABetaProgram@1.0.0. Versioned only; do not apply without deployment authorization.
begin;

create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entitlement text not null check (entitlement ~ '^[a-z][a-z0-9_]{1,63}$'),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  note text check (note is null or length(note) <= 500),
  check (expires_at is null or expires_at > granted_at)
);

create unique index user_entitlements_active_unique
  on public.user_entitlements(user_id, entitlement) where revoked_at is null;
create index user_entitlements_user_active_idx
  on public.user_entitlements(user_id, entitlement, expires_at) where revoked_at is null;

create table public.beta_experiments (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,63}$'),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
  display_name text not null check (length(display_name) between 1 and 100),
  description text not null check (length(description) between 1 and 300),
  stage text not null check (stage in ('development','internal-alpha','internal-beta','closed-beta','public-beta','released','retired')),
  enabled boolean not null default false,
  route text not null check (route ~ '^/[a-z0-9][a-z0-9/_-]*$'),
  access_policy text not null check (access_policy in ('global-beta','feature-entitlement','global-or-feature','public-beta','owner-only')),
  required_entitlement text check (required_entitlement is null or required_entitlement ~ '^[a-z][a-z0-9_]{1,63}$'),
  feedback_enabled boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  started_at timestamptz,
  ends_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or started_at is null or ends_at > started_at),
  check (access_policy not in ('feature-entitlement','global-or-feature') or required_entitlement is not null),
  check (stage <> 'released' or released_at is not null)
);

create table public.beta_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id text references public.beta_experiments(id) on delete restrict,
  event_type text not null check (event_type in ('beta_center_viewed','experiment_opened')),
  created_at timestamptz not null default now()
);
create index beta_audit_events_user_created_idx on public.beta_audit_events(user_id, created_at desc);

alter table public.user_entitlements enable row level security;
alter table public.beta_experiments enable row level security;
alter table public.beta_audit_events enable row level security;
alter table public.user_entitlements force row level security;
alter table public.beta_experiments force row level security;
alter table public.beta_audit_events force row level security;

revoke all on public.user_entitlements, public.beta_experiments, public.beta_audit_events from public, anon, authenticated;
revoke all on sequence public.beta_audit_events_id_seq from public, anon, authenticated;
grant select, insert, update on public.user_entitlements, public.beta_experiments to service_role;
grant select, insert on public.beta_audit_events to service_role;
grant usage, select on sequence public.beta_audit_events_id_seq to service_role;

insert into public.beta_experiments (
  id, slug, display_name, description, stage, enabled, route, access_policy,
  required_entitlement, feedback_enabled, sort_order, started_at
) values (
  'scanner', 'scanner', 'CAISSA Scanner', 'Scan chess positions from your phone or screen.',
  'internal-beta', true, '/scanner/beta', 'global-beta', null, true, 10, now()
);

commit;
