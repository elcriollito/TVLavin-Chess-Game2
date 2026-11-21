-- Cover the two participant foreign keys independently. The Arena's partial
-- uniqueness indexes begin with tournament_id and therefore do not support
-- PostgreSQL's user-centric FK maintenance lookups.

begin;

create index caissa_online_arena_pairings_white_user_fk_idx
  on public.caissa_online_arena_pairings(white_user_id);

create index caissa_online_arena_pairings_black_user_fk_idx
  on public.caissa_online_arena_pairings(black_user_id);

commit;
