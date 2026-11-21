-- CAISSA Tournaments Expansion S001 hosted advisor follow-up.
-- Cover the four foreign keys introduced by the expansion migration so
-- cascades, user cleanup and official-series lookups stay bounded.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists caissa_online_daily_events_actor_user_fk_idx
  on public.caissa_online_daily_events(actor_user_id)
  where actor_user_id is not null;

create index if not exists caissa_online_daily_group_members_user_fk_idx
  on public.caissa_online_daily_group_members(user_id);

create index if not exists caissa_online_tournament_games_daily_group_fk_idx
  on public.caissa_online_tournament_games(daily_group_id)
  where daily_group_id is not null;

create index if not exists caissa_online_tournaments_series_fk_idx
  on public.caissa_online_tournaments(series_id)
  where series_id is not null;

commit;
