-- Destructive only for Public Identity v1 objects. Nicknames in the identity
-- table are lost; historical games, ratings, economic data, and Online functions remain.
create or replace function caissa_online_private.broadcast_game_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'online-game:' || coalesce(new.id, old.id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;
revoke all on function caissa_online_private.broadcast_game_change() from public, anon, authenticated;

grant select on table public.caissa_online_games to authenticated;
drop policy if exists caissa_online_participant_game_read on public.caissa_online_games;
create policy caissa_online_participant_game_read
on public.caissa_online_games
for select
to authenticated
using (((select auth.jwt())->>'sub') in (white_clerk_id, black_clerk_id));

drop policy if exists caissa_online_game_broadcast_read on realtime.messages;
create policy caissa_online_game_broadcast_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.caissa_online_games game
    where (select realtime.topic()) = 'online-game:' || game.id::text
      and ((select auth.jwt())->>'sub') in (game.white_clerk_id, game.black_clerk_id)
  )
);
revoke usage on schema caissa_online_private from authenticated;
drop function if exists caissa_online_private.can_read_current_game_topic();

drop function if exists public.caissa_public_identity_resolve_many(text[]);
drop function if exists public.caissa_public_identity_update(text, text, text, integer, integer);
drop function if exists public.caissa_public_identity_check_nickname(text, text, text, integer);
drop function if exists public.caissa_public_identity_get_or_create(text);
drop trigger if exists caissa_online_games_public_identity_snapshot on public.caissa_online_games;
drop function if exists caissa_identity_private.snapshot_online_game_names();
alter table if exists public.caissa_online_games
  drop constraint if exists caissa_online_games_identity_policy_version_check,
  drop column if exists identity_policy_version;
drop table if exists public.caissa_public_identities;
drop function if exists caissa_identity_private.prepare_identity_row();
drop function if exists caissa_identity_private.generate_fallback_alias();
drop function if exists caissa_identity_private.assert_policy_payload(text, text, integer);
drop function if exists caissa_identity_private.nickname_display(text);
drop function if exists caissa_identity_private.contains_default_ignorable(text);
drop schema if exists caissa_identity_private;
