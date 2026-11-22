\set ON_ERROR_STOP on

\ir ../../supabase/arena-s001-clean-room/supabase/migrations/20261120235311_caissa_arena_s001_rematch_hardening.sql
\ir ../../supabase/arena-s001-clean-room/supabase/migrations/20261121000412_caissa_arena_s001_concurrent_rematch_hardening.sql

insert into public.users(clerk_id, email) values
  ('founder_2a', 'founder_2a@example.test'),
  ('founder_2b', 'founder_2b@example.test'),
  ('founder_2c', 'founder_2c@example.test'),
  ('founder_2d', 'founder_2d@example.test')
on conflict (clerk_id) do nothing;

select public.caissa_public_identity_get_or_create('founder_2a');
select public.caissa_public_identity_get_or_create('founder_2b');
select public.caissa_public_identity_get_or_create('founder_2c');
select public.caissa_public_identity_get_or_create('founder_2d');

select public.caissa_online_heartbeat('founder_2a', 'Founder 2A');
select public.caissa_online_heartbeat('founder_2b', 'Founder 2B');
select public.caissa_online_heartbeat('founder_2c', 'Founder 2C');
select public.caissa_online_heartbeat('founder_2d', 'Founder 2D');

select public.caissa_online_arena_create(
  'founder_2a', 'arena-create:rematch-hardening-003', 'Concurrent rematch hardening certification',
  clock_timestamp() + interval '0.5 seconds', 15, 'blitz', 180000, 2000
);

select public.caissa_online_arena_join('founder_2a', id, 'arena-join:rematch-003-founder-2a')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';
select public.caissa_online_arena_join('founder_2b', id, 'arena-join:rematch-003-founder-2b')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';
select public.caissa_online_arena_join('founder_2c', id, 'arena-join:rematch-003-founder-2c')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';
select public.caissa_online_arena_join('founder_2d', id, 'arena-join:rematch-003-founder-2d')
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

select pg_sleep(0.6);
select public.caissa_online_arena_sync('founder_2a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003';
  if (select count(*) from public.caissa_online_games
      where tournament_id = v_tournament_id and status = 'active') <> 2 then
    raise exception 'round one did not contain two simultaneous games';
  end if;
end;
$$;

-- Finish board one, then sync in its own transactions. The two newly waiting
-- players must wait for the unseen opponents who are still playing board two.
select public.caissa_online_finish_game(
  game.white_clerk_id, game.id, 'rematch-hardening-003-r1-board1', 'resignation'
)
from public.caissa_online_games game
where game.tournament_id = (
  select id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003'
) and game.status = 'active'
order by game.id
limit 1;

select public.caissa_online_arena_sync('founder_2a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003';
  if (select count(*) from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id) <> 2 then
    raise exception 'an immediate rematch was created while an unseen opponent was still playing';
  end if;
end;
$$;

select public.caissa_online_finish_game(
  game.white_clerk_id, game.id, 'rematch-hardening-003-r1-board2', 'resignation'
)
from public.caissa_online_games game
where game.tournament_id = (
  select id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003'
) and game.status = 'active'
order by game.id
limit 1;

select public.caissa_online_arena_sync('founder_2a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003';
  if (select count(*) from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id) <> 4 then
    raise exception 'round two was not created after both boards finished';
  end if;
  if (select count(*) from (
      select least(white_user_id::text, black_user_id::text),
             greatest(white_user_id::text, black_user_id::text)
      from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id group by 1, 2
    ) unique_opponents) <> 4 then
    raise exception 'round two contained a rematch';
  end if;
end;
$$;

-- Repeat the separate-transaction finish order for round two.
select public.caissa_online_finish_game(
  game.white_clerk_id, game.id, 'rematch-hardening-003-r2-board1', 'resignation'
)
from public.caissa_online_games game
where game.tournament_id = (
  select id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003'
) and game.status = 'active'
order by game.id
limit 1;

select public.caissa_online_arena_sync('founder_2a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003';
  if (select count(*) from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id) <> 4 then
    raise exception 'second separate-transaction finish created an early rematch';
  end if;
end;
$$;

select public.caissa_online_finish_game(
  game.white_clerk_id, game.id, 'rematch-hardening-003-r2-board2', 'resignation'
)
from public.caissa_online_games game
where game.tournament_id = (
  select id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003'
) and game.status = 'active'
order by game.id
limit 1;

select public.caissa_online_arena_sync('founder_2a', id)
from public.caissa_online_tournaments where creation_event_id = 'arena-create:rematch-hardening-003';

do $$
declare v_tournament_id uuid;
begin
  select id into v_tournament_id from public.caissa_online_tournaments
  where creation_event_id = 'arena-create:rematch-hardening-003';
  if (select count(*) from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id) <> 6 then
    raise exception 'expected six pairings across three rounds';
  end if;
  if (select count(*) from (
      select least(white_user_id::text, black_user_id::text),
             greatest(white_user_id::text, black_user_id::text)
      from public.caissa_online_arena_pairings
      where tournament_id = v_tournament_id group by 1, 2
    ) unique_opponents) <> 6 then
    raise exception 'a rematch occurred before all six opponent pairs were exhausted';
  end if;
end;
$$;

select 'ARENA_CONCURRENT_REMATCH_HARDENING_PASS';
