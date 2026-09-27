-- Apply before enabling /api/puzzles/progress. Clerk identity is verified by the server.
begin;

create table public.puzzle_training_progress (
  user_id uuid primary key references public.users(id) on delete cascade,
  rating integer not null default 1800 check (rating between 100 and 5000),
  solved integer not null default 0 check (solved >= 0),
  failed integer not null default 0 check (failed >= 0),
  updated_at timestamptz not null default now()
);
create table public.puzzle_training_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  source_version date not null,
  puzzle_id text not null check (puzzle_id ~ '^[A-Za-z0-9]{5}$'),
  puzzle_rating integer not null check (puzzle_rating between 1 and 5000),
  outcome text not null check (outcome in ('solved', 'failed')),
  assisted boolean not null default false,
  rating_before integer not null,
  rating_after integer not null,
  calculation_version smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);
create index puzzle_training_attempts_recent_idx
  on public.puzzle_training_attempts(user_id, source_version, puzzle_id, created_at desc);

alter table public.puzzle_training_progress enable row level security;
alter table public.puzzle_training_progress force row level security;
alter table public.puzzle_training_attempts enable row level security;
alter table public.puzzle_training_attempts force row level security;
revoke all on public.puzzle_training_progress, public.puzzle_training_attempts from public, anon, authenticated;
grant select on public.puzzle_training_progress, public.puzzle_training_attempts to service_role;
grant usage, select on sequence public.puzzle_training_attempts_id_seq to service_role;

-- Atomic and idempotent: serializes writes for one account, and allows one
-- rating result per puzzle and source version every 30 days.
create function public.record_puzzle_training_attempt(
  p_user_id uuid, p_operation_id uuid, p_source_version date,
  p_puzzle_id text, p_puzzle_rating integer, p_outcome text, p_assisted boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_progress public.puzzle_training_progress%rowtype;
  previous_attempt public.puzzle_training_attempts%rowtype;
  new_rating integer;
begin
  if p_user_id is null or p_operation_id is null or p_source_version <> date '2026-09-10'
     or p_puzzle_id !~ '^[A-Za-z0-9]{5}$' or p_puzzle_rating not between 1 and 5000
     or p_outcome not in ('solved', 'failed') or p_assisted is null then
    raise exception 'Invalid puzzle result';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into previous_attempt from public.puzzle_training_attempts
   where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    return pg_catalog.jsonb_build_object('rating', previous_attempt.rating_after, 'duplicate', true);
  end if;
  insert into public.puzzle_training_progress(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select * into current_progress from public.puzzle_training_progress
    where user_id = p_user_id for update;
  if exists (select 1 from public.puzzle_training_attempts
      where user_id = p_user_id and source_version = p_source_version
        and puzzle_id = p_puzzle_id and created_at > now() - interval '30 days') then
    return pg_catalog.jsonb_build_object('rating', current_progress.rating, 'duplicate', true);
  end if;
  new_rating := current_progress.rating;
  if not p_assisted then
    new_rating := least(5000, greatest(100, current_progress.rating + pg_catalog.round(
      24 * (case when p_outcome = 'solved' then 1 else 0 end
          - 1.0 / (1 + pg_catalog.power(10.0, (p_puzzle_rating - current_progress.rating) / 400.0)))
    )::integer));
  end if;
  insert into public.puzzle_training_attempts(user_id, operation_id, source_version,
      puzzle_id, puzzle_rating, outcome, assisted, rating_before, rating_after)
    values (p_user_id, p_operation_id, p_source_version, p_puzzle_id,
      p_puzzle_rating, p_outcome, p_assisted, current_progress.rating, new_rating);
  update public.puzzle_training_progress set rating = new_rating,
      solved = solved + (p_outcome = 'solved')::integer,
      failed = failed + (p_outcome = 'failed')::integer, updated_at = now()
    where user_id = p_user_id;
  return pg_catalog.jsonb_build_object('rating', new_rating,
      'solved', current_progress.solved + (p_outcome = 'solved')::integer,
      'failed', current_progress.failed + (p_outcome = 'failed')::integer,
      'change', new_rating - current_progress.rating, 'duplicate', false);
end;
$$;
revoke all on function public.record_puzzle_training_attempt(uuid, uuid, date, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_puzzle_training_attempt(uuid, uuid, date, text, integer, text, boolean)
  to service_role;
commit;
