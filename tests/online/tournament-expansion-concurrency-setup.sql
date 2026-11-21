\set ON_ERROR_STOP on
insert into public.users(clerk_id,email,role)
select 'race_player_'||n,'race'||n||'@example.test','user' from generate_series(1,5)n;
do $$
declare r record;
begin
  for r in select clerk_id from public.users where clerk_id like 'race_player_%' loop
    perform public.caissa_public_identity_get_or_create(r.clerk_id);
    perform public.caissa_online_heartbeat(r.clerk_id,replace(initcap(r.clerk_id),'_',' '));
  end loop;
end;
$$;
select public.caissa_online_arena_create(
  'race_player_1','arena-create:final-slot-race','Final Slot Race',
  clock_timestamp()+interval '2 minutes',30,'blitz',180000,2000,4,true,false
);
select public.caissa_online_arena_join('race_player_1',id,'race-join:player-1')
from public.caissa_online_tournaments where creation_event_id='arena-create:final-slot-race';
select public.caissa_online_arena_join('race_player_2',id,'race-join:player-2')
from public.caissa_online_tournaments where creation_event_id='arena-create:final-slot-race';
select public.caissa_online_arena_join('race_player_3',id,'race-join:player-3')
from public.caissa_online_tournaments where creation_event_id='arena-create:final-slot-race';
