-- Review-only migration for CAISSA Opening Trainer v1.
-- Server-mediated through Clerk-authenticated API routes; do not expose via Data API.
create table if not exists public.opening_repertoires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 120),
  schema_version text not null default 'CaissaOpeningRepertoire@1.0.0',
  name text not null check (char_length(name) between 1 and 100),
  color text not null check (color in ('white', 'black')),
  eco text not null default '' check (char_length(eco) <= 3),
  opening text not null check (char_length(opening) between 1 and 160),
  initial_fen text not null check (char_length(initial_fen) between 4 and 120),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  local_created_at timestamptz not null,
  local_updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists opening_repertoires_user_updated_idx
  on public.opening_repertoires (user_id, local_updated_at desc);

alter table public.opening_repertoires enable row level security;
revoke all on table public.opening_repertoires from anon, authenticated;
grant all on table public.opening_repertoires to service_role;

comment on table public.opening_repertoires is
  'Private opening repertoires accessed only by CAISSA Clerk-authenticated server routes.';
