\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema realtime;

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function realtime.topic()
returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
create table realtime.messages(extension text);
alter table realtime.messages enable row level security;
create or replace function realtime.send(jsonb, text, text, boolean)
returns void language sql as $$ select $$;
create or replace function realtime.broadcast_changes(text, text, text, text, text, anyelement, anyelement)
returns void language sql as $$ select $$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'user',
  is_premium boolean not null default false,
  credits integer not null default 0
);

\ir ../../supabase/migrations/20261005204209_caissa_online_native_v1.sql
\ir ../../supabase/migrations/20261011150814_caissa_online_hardening_only_v3.sql
\ir ../../supabase/migrations/20261014035549_caissa_public_identity_v1.sql
\ir ../../supabase/migrations/20261120033413_caissa_online_arena_s001.sql

insert into public.users(clerk_id, email, role) values
  ('founder_a', 'a@example.test', 'user'),
  ('founder_b', 'b@example.test', 'user'),
  ('founder_c', 'c@example.test', 'user'),
  ('founder_d', 'd@example.test', 'user'),
  ('founder_e', 'e@example.test', 'user');

select public.caissa_public_identity_get_or_create(clerk_id) from public.users order by clerk_id;
select public.caissa_online_heartbeat('founder_a', 'Founder A');
select public.caissa_online_heartbeat('founder_b', 'Founder B');
select public.caissa_online_heartbeat('founder_c', 'Founder C');
select public.caissa_online_heartbeat('founder_d', 'Founder D');
select public.caissa_online_heartbeat('founder_e', 'Founder E');

select public.caissa_online_arena_create(
  'founder_a', 'arena-create:founders-beta-001', 'CAISSA Arena S001 — Founders Beta',
  clock_timestamp() + interval '1 second', 15, 'blitz', 180000, 2000
);

select public.caissa_online_arena_join('founder_a', id, 'arena-join:founder-a-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_join('founder_b', id, 'arena-join:founder-b-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_join('founder_c', id, 'arena-join:founder-c-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_join('founder_d', id, 'arena-join:founder-d-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

-- A retried registration event and a distinct no-op join are both idempotent.
-- Neither may create an audit row or inflate the tournament version.
select public.caissa_online_arena_join('founder_d', id, 'arena-join:founder-d-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_join('founder_d', id, 'arena-join:founder-d-noop')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if exists(select 1 from public.caissa_online_arena_events
      where tournament_id = v_tournament_id and event_id = 'arena-join:founder-d-noop') then
    raise exception 'no-op join created an audit event';
  end if;
end;
$$;

-- A nonparticipant cannot mutate the tournament through the withdrawal RPC.
do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  begin
    perform public.caissa_online_arena_withdraw(
      'founder_e', v_tournament_id, 'arena-withdraw:founder-e-noop'
    );
    raise exception 'nonparticipant withdrawal unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'CAISSA_ONLINE_ARENA_NOT_PARTICIPANT' then raise; end if;
  end;
  if exists(select 1 from public.caissa_online_arena_events
      where tournament_id = v_tournament_id and event_id = 'arena-withdraw:founder-e-noop') then
    raise exception 'nonparticipant withdrawal created an audit event';
  end if;
end;
$$;

-- Withdrawal prevents pairing until a distinct, authenticated rejoin restores
-- registration.
select public.caissa_online_arena_withdraw('founder_d', id, 'arena-withdraw:founder-d-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_withdraw('founder_d', id, 'arena-withdraw:founder-d-noop')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';
do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if (select count(*) from public.caissa_online_tournament_participants
      where tournament_id = v_tournament_id) <> 4 then
    raise exception 'duplicate registration created another participant';
  end if;
  if (select state from public.caissa_online_tournament_participants
      where tournament_id = v_tournament_id and clerk_id = 'founder_d') <> 'withdrawn' then
    raise exception 'withdrawal did not persist';
  end if;
  if exists(select 1 from public.caissa_online_arena_events
      where tournament_id = v_tournament_id and event_id = 'arena-withdraw:founder-d-noop') then
    raise exception 'no-op withdrawal created an audit event';
  end if;
end;
$$;
select public.caissa_online_arena_join('founder_d', id, 'arena-rejoin:founder-d-001')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

select pg_sleep(1.1);
select public.caissa_online_arena_sync('founder_a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if (select status from public.caissa_online_tournaments where id = v_tournament_id) <> 'active' then
    raise exception 'expected active tournament';
  end if;
  if (select count(*) from public.caissa_online_games where tournament_id = v_tournament_id and status = 'active') <> 2 then
    raise exception 'expected exactly two simultaneous games';
  end if;
  if (select count(distinct player_id) from (
      select white_user_id player_id from public.caissa_online_games where tournament_id = v_tournament_id and status = 'active'
      union all
      select black_user_id from public.caissa_online_games where tournament_id = v_tournament_id and status = 'active'
    ) players) <> 4 then
    raise exception 'a participant was double paired';
  end if;
end;
$$;

do $$
declare game_row record;
begin
  for game_row in select id, white_clerk_id from public.caissa_online_games
    where tournament_id = (select id from public.caissa_online_tournaments
      where creation_event_id = 'arena-create:founders-beta-001') and status = 'active'
    order by id
  loop
    perform public.caissa_online_finish_game(
      game_row.white_clerk_id, game_row.id, 'arena-resign:' || game_row.id::text, 'resignation'
    );
  end loop;
end;
$$;

select public.caissa_online_arena_sync('founder_a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

do $$
declare v_tournament_id uuid;
declare v_points numeric;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if (select count(*) from public.caissa_online_tournament_games
      where tournament_id = v_tournament_id and scored_at is not null) <> 2 then
    raise exception 'expected exactly two scored games';
  end if;
  if (select sum(score) from public.caissa_online_tournament_participants
      where tournament_id = v_tournament_id) <> 4 then
    raise exception '2/1/0 score total is incorrect';
  end if;
  if (select count(*) from public.caissa_online_games
      where tournament_id = v_tournament_id and status = 'active') <> 2 then
    raise exception 'expected two successive pairings';
  end if;
  select sum(score) into v_points from public.caissa_online_tournament_participants
    where tournament_id = v_tournament_id;
  perform public.caissa_online_arena_sync('founder_a', v_tournament_id);
  if (select sum(score) from public.caissa_online_tournament_participants
      where tournament_id = v_tournament_id) <> v_points then
    raise exception 'result scoring was not idempotent';
  end if;
end;
$$;

update public.caissa_online_tournaments
set ends_at = clock_timestamp() - interval '1 second'
where creation_event_id = 'arena-create:founders-beta-001';
select public.caissa_online_arena_sync('founder_a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if (select status from public.caissa_online_tournaments where id = v_tournament_id) <> 'finishing' then
    raise exception 'expected finishing state while games remain active';
  end if;
end;
$$;

do $$
declare game_row record;
begin
  for game_row in select id, white_clerk_id from public.caissa_online_games
    where tournament_id = (select id from public.caissa_online_tournaments
      where creation_event_id = 'arena-create:founders-beta-001') and status = 'active'
  loop
    perform public.caissa_online_finish_game(
      game_row.white_clerk_id, game_row.id, 'arena-final-resign:' || game_row.id::text, 'resignation'
    );
  end loop;
end;
$$;
select public.caissa_online_arena_sync('founder_a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:founders-beta-001';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:founders-beta-001';
  if (select status from public.caissa_online_tournaments where id = v_tournament_id) <> 'completed' then
    raise exception 'expected completed tournament';
  end if;
  if exists(select 1 from public.caissa_online_games where tournament_id = v_tournament_id and status = 'active') then
    raise exception 'active game remained after final completion';
  end if;
  if (select count(*) from public.caissa_online_tournament_participants
      where tournament_id = v_tournament_id and rank is not null) <> 4 then
    raise exception 'final ranks were not published';
  end if;
end;
$$;
