-- Manual emergency rollback for CAISSA Online Native v1.
-- Run only after CAISSA_ONLINE_ROLLOUT=off and after exporting game records.
-- This is intentionally not an automatic down migration: it destroys online-game data.

drop policy if exists caissa_online_game_broadcast_read on realtime.messages;
drop trigger if exists caissa_online_game_broadcast on public.caissa_online_games;

drop function if exists public.caissa_online_respond_challenge(text, uuid, text);
drop function if exists public.caissa_online_create_challenge(text, text, text, integer, integer, boolean);
drop function if exists public.caissa_online_draw_offer(text, uuid, text, text);
drop function if exists public.caissa_online_finish_game(text, uuid, text, text);
drop function if exists public.caissa_online_commit_move(text, uuid, text, integer, text, text, text, text, text, text, text, text, text, text, boolean, boolean);
drop function if exists public.caissa_online_leave_queue(text);
drop function if exists public.caissa_online_join_queue(text, text, text, integer, integer, boolean);
drop function if exists public.caissa_online_check_rate_limit(text, text, integer, integer);
drop function if exists public.caissa_online_heartbeat(text, text);
drop function if exists public.caissa_online_state(text);
drop function if exists caissa_online_private.broadcast_game_change();
drop function if exists caissa_online_private.game_state(text);
drop function if exists caissa_online_private.apply_rating(uuid);
drop function if exists caissa_online_private.timeout_result(text, boolean, boolean);
drop function if exists caissa_online_private.rating_delta(integer, integer, integer, numeric);

drop table if exists public.caissa_online_tournament_games;
drop table if exists public.caissa_online_tournament_participants;
drop table if exists public.caissa_online_challenges;
drop table if exists public.caissa_online_rate_limits;
drop table if exists public.caissa_online_presence;
drop table if exists public.caissa_online_game_events;
drop table if exists public.caissa_online_matchmaking_tickets;
drop table if exists public.caissa_online_games;
drop table if exists public.caissa_online_tournaments;
drop table if exists public.caissa_online_ratings;
drop table if exists public.caissa_online_profiles;
drop schema if exists caissa_online_private;
