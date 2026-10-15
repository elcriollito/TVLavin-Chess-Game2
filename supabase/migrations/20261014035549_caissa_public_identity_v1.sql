-- CAISSA global public player identity v1.
-- The Node policy is the canonical Unicode decision point. PostgreSQL stores the
-- versioned, already-validated payload and independently enforces normalization,
-- uniqueness, ownership, privileges, and safe presentation invariants.

create schema if not exists caissa_identity_private;
revoke all on schema caissa_identity_private from public, anon, authenticated;
grant usage on schema caissa_identity_private to service_role;

create or replace function caissa_identity_private.contains_default_ignorable(p_value text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_value ~ U&'[\00AD\034F\061C\115F-\1160\17B4-\17B5\180B-\180F\200B-\200F\202A-\202E\2060-\206F\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFF8]'
    or p_value ~ U&'[\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]';
$$;

create or replace function caissa_identity_private.nickname_display(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_display text;
  v_key text;
begin
  if p_value ~ '[[:cntrl:]]'
    or caissa_identity_private.contains_default_ignorable(p_value) then
    raise exception 'CAISSA_IDENTITY_INVISIBLE_CHARACTER' using errcode = '22023';
  end if;

  v_display := normalize(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_value), '[[:space:]]+', ' ', 'g'),
    NFC
  );

  if pg_catalog.char_length(v_display) < 3
    or pg_catalog.char_length(v_display) > 40
    or pg_catalog.octet_length(v_display) > 192 then
    raise exception 'CAISSA_IDENTITY_INVALID_LENGTH' using errcode = '22023';
  end if;
  if v_display ~ '^[ ._''’\-]' or v_display ~ '[ ._''’\-]$'
    or v_display ~ '[<>&"/\\@:;,=+*?!|{}\[\]()]' then
    raise exception 'CAISSA_IDENTITY_INVALID_CHARACTERS' using errcode = '22023';
  end if;

  v_key := pg_catalog.lower(normalize(v_display, NFKC));
  if v_key in (
    'admin', 'administrator', 'anonymous', 'caissa', 'caissa admin',
    'caissa staff', 'caissa support', 'guest', 'moderator', 'official',
    'player', 'staff', 'support', 'system'
  ) or v_key ~ '^player-[0-9a-f]{16}$' then
    raise exception 'CAISSA_IDENTITY_RESERVED_NICKNAME' using errcode = '22023';
  end if;

  return v_display;
end;
$$;

create or replace function caissa_identity_private.assert_policy_payload(
  p_value text,
  p_key text,
  p_policy_version integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_display text;
begin
  if p_policy_version is distinct from 1 then
    raise exception 'CAISSA_IDENTITY_POLICY_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if p_value is null and p_key is null then return; end if;
  if p_value is null or p_key is null then
    raise exception 'CAISSA_IDENTITY_POLICY_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  v_display := caissa_identity_private.nickname_display(p_value);
  if v_display is distinct from p_value
    or p_key is distinct from pg_catalog.lower(normalize(v_display, NFKC))
    or normalize(p_key, NFKC) is distinct from p_key
    or pg_catalog.char_length(p_key) not between 1 and 192
    or pg_catalog.octet_length(p_key) > 384
    or p_key ~ '[[:cntrl:]]'
    or caissa_identity_private.contains_default_ignorable(p_key) then
    raise exception 'CAISSA_IDENTITY_POLICY_PAYLOAD_INVALID' using errcode = '22023';
  end if;
end;
$$;

create or replace function caissa_identity_private.generate_fallback_alias()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'Player-' || pg_catalog.upper(pg_catalog.substr(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16
  ));
$$;

create table public.caissa_public_identities (
  user_id uuid primary key references public.users(id) on delete cascade,
  public_nickname text,
  nickname_key text,
  nickname_policy_version smallint not null default 1,
  fallback_alias text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  version integer not null default 1,
  constraint caissa_public_identities_nickname_pair_check
    check ((public_nickname is null) = (nickname_key is null)),
  constraint caissa_public_identities_policy_version_check
    check (nickname_policy_version = 1),
  constraint caissa_public_identities_fallback_alias_check
    check (fallback_alias ~ '^Player-[0-9A-F]{16}$'),
  constraint caissa_public_identities_version_check check (version > 0),
  constraint caissa_public_identities_fallback_alias_key unique (fallback_alias)
);

create unique index caissa_public_identities_nickname_key_uq
  on public.caissa_public_identities(nickname_key)
  where nickname_key is not null;

create or replace function caissa_identity_private.prepare_identity_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.public_nickname is null or pg_catalog.btrim(new.public_nickname) = '' then
    new.public_nickname := null;
    new.nickname_key := null;
    new.nickname_policy_version := 1;
  else
    perform caissa_identity_private.assert_policy_payload(
      new.public_nickname, new.nickname_key, new.nickname_policy_version
    );
  end if;

  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.fallback_alias := old.fallback_alias;
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger caissa_public_identities_prepare
before insert or update on public.caissa_public_identities
for each row execute function caissa_identity_private.prepare_identity_row();

alter table public.caissa_online_games
  add column identity_policy_version smallint not null default 0,
  add constraint caissa_online_games_identity_policy_version_check
    check (identity_policy_version in (0, 1));

create or replace function caissa_identity_private.snapshot_online_game_names()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_white_role text;
  v_black_role text;
  v_white_identity text;
  v_black_identity text;
begin
  select u.role, coalesce(i.public_nickname, i.fallback_alias)
    into v_white_role, v_white_identity
  from public.users u
  left join public.caissa_public_identities i on i.user_id = u.id
  where u.id = new.white_user_id;

  select u.role, coalesce(i.public_nickname, i.fallback_alias)
    into v_black_role, v_black_identity
  from public.users u
  left join public.caissa_public_identities i on i.user_id = u.id
  where u.id = new.black_user_id;

  if v_white_role is distinct from 'online_guest' then
    if v_white_identity is null then
      raise exception 'CAISSA_IDENTITY_REQUIRED' using errcode = 'P0002';
    end if;
    new.white_display_name := v_white_identity;
  elsif new.white_display_name !~ '^Guest-[0-9A-F]{6}$' then
    raise exception 'CAISSA_IDENTITY_INVALID_GUEST_ALIAS' using errcode = '22023';
  end if;

  if v_black_role is distinct from 'online_guest' then
    if v_black_identity is null then
      raise exception 'CAISSA_IDENTITY_REQUIRED' using errcode = 'P0002';
    end if;
    new.black_display_name := v_black_identity;
  elsif new.black_display_name !~ '^Guest-[0-9A-F]{6}$' then
    raise exception 'CAISSA_IDENTITY_INVALID_GUEST_ALIAS' using errcode = '22023';
  end if;

  new.identity_policy_version := 1;
  return new;
end;
$$;

create trigger caissa_online_games_public_identity_snapshot
before insert on public.caissa_online_games
for each row execute function caissa_identity_private.snapshot_online_game_names();

alter table public.caissa_public_identities enable row level security;

revoke all on table public.caissa_public_identities from public, anon, authenticated, service_role;
grant select on table public.caissa_public_identities to service_role;

create or replace function public.caissa_public_identity_get_or_create(p_clerk_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_identity public.caissa_public_identities%rowtype;
  v_attempt integer := 0;
begin
  if p_clerk_id is null or pg_catalog.char_length(p_clerk_id) not between 1 and 255 then
    raise exception 'CAISSA_IDENTITY_INVALID_SUBJECT' using errcode = '22023';
  end if;

  select u.id, u.role into v_user_id, v_user_role
  from public.users u
  where u.clerk_id = p_clerk_id;
  if v_user_id is null then
    raise exception 'CAISSA_IDENTITY_USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_user_role = 'online_guest' then
    raise exception 'CAISSA_IDENTITY_GUEST_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_identity
  from public.caissa_public_identities i
  where i.user_id = v_user_id;

  while v_identity.user_id is null and v_attempt < 8 loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.caissa_public_identities(
        user_id, nickname_policy_version, fallback_alias
      ) values (
        v_user_id, 1, caissa_identity_private.generate_fallback_alias()
      )
      on conflict (user_id) do nothing
      returning * into v_identity;
    exception when unique_violation then
      v_identity := null;
    end;

    if v_identity.user_id is null then
      select * into v_identity
      from public.caissa_public_identities i
      where i.user_id = v_user_id;
    end if;
  end loop;

  if v_identity.user_id is null then
    raise exception 'CAISSA_IDENTITY_ALIAS_COLLISION' using errcode = 'P0001';
  end if;

  return pg_catalog.jsonb_build_object(
    'displayName', coalesce(v_identity.public_nickname, v_identity.fallback_alias),
    'nickname', v_identity.public_nickname,
    'fallbackAlias', v_identity.fallback_alias,
    'hasCustomNickname', v_identity.public_nickname is not null,
    'policyVersion', v_identity.nickname_policy_version,
    'version', v_identity.version,
    'updatedAt', v_identity.updated_at
  );
end;
$$;

create or replace function public.caissa_public_identity_check_nickname(
  p_clerk_id text,
  p_nickname text,
  p_nickname_key text,
  p_policy_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_taken boolean;
begin
  select u.id into v_user_id from public.users u
  where u.clerk_id = p_clerk_id and u.role <> 'online_guest';
  if v_user_id is null then
    raise exception 'CAISSA_IDENTITY_USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform caissa_identity_private.assert_policy_payload(
    p_nickname, p_nickname_key, p_policy_version
  );
  select exists(
    select 1 from public.caissa_public_identities i
    where i.nickname_key = p_nickname_key and i.user_id <> v_user_id
  ) into v_taken;
  return pg_catalog.jsonb_build_object(
    'available', not v_taken,
    'normalizedNickname', p_nickname,
    'policyVersion', p_policy_version
  );
end;
$$;

create or replace function public.caissa_public_identity_update(
  p_clerk_id text,
  p_nickname text,
  p_nickname_key text,
  p_policy_version integer,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_identity public.caissa_public_identities%rowtype;
begin
  select u.id into v_user_id from public.users u
  where u.clerk_id = p_clerk_id and u.role <> 'online_guest';
  if v_user_id is null then
    raise exception 'CAISSA_IDENTITY_USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform caissa_identity_private.assert_policy_payload(
    p_nickname, p_nickname_key, p_policy_version
  );

  perform public.caissa_public_identity_get_or_create(p_clerk_id);
  select * into v_identity
  from public.caissa_public_identities i
  where i.user_id = v_user_id
  for update;

  if p_expected_version is null or p_expected_version <> v_identity.version then
    raise exception 'CAISSA_IDENTITY_STALE_VERSION' using errcode = '40001';
  end if;

  update public.caissa_public_identities
  set public_nickname = p_nickname,
      nickname_key = p_nickname_key,
      nickname_policy_version = p_policy_version,
      version = version + 1
  where user_id = v_user_id
  returning * into v_identity;

  return pg_catalog.jsonb_build_object(
    'displayName', coalesce(v_identity.public_nickname, v_identity.fallback_alias),
    'nickname', v_identity.public_nickname,
    'fallbackAlias', v_identity.fallback_alias,
    'hasCustomNickname', v_identity.public_nickname is not null,
    'policyVersion', v_identity.nickname_policy_version,
    'version', v_identity.version,
    'updatedAt', v_identity.updated_at
  );
exception when unique_violation then
  raise exception 'CAISSA_IDENTITY_NICKNAME_TAKEN' using errcode = 'P0001';
end;
$$;

create or replace function public.caissa_public_identity_resolve_many(p_clerk_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_clerk_ids is null or pg_catalog.cardinality(p_clerk_ids) > 100 then
    raise exception 'CAISSA_IDENTITY_INVALID_SUBJECT_SET' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_object_agg(u.clerk_id, pg_catalog.jsonb_build_object(
    'userId', u.id,
    'role', u.role,
    'displayName', case when u.role = 'online_guest' then null
      else coalesce(i.public_nickname, i.fallback_alias) end,
    'policyVersion', i.nickname_policy_version
  )), '{}'::jsonb)
  into v_result
  from public.users u
  left join public.caissa_public_identities i on i.user_id = u.id
  where u.clerk_id = any(p_clerk_ids);
  return v_result;
end;
$$;

-- Existing members receive only a random, non-identifying fallback. No private
-- account name or email is imported into the public identity table.
do $$
declare
  v_subject text;
begin
  for v_subject in
    select u.clerk_id from public.users u where u.role <> 'online_guest'
  loop
    perform public.caissa_public_identity_get_or_create(v_subject);
  end loop;
end;
$$;

-- Realtime authorization needs only a participant predicate. Keeping this
-- lookup behind a SECURITY DEFINER helper lets browser roles lose direct
-- SELECT access to full game rows while private topics continue to work.
create or replace function caissa_online_private.can_read_current_game_topic()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.caissa_online_games game
    where (select realtime.topic()) = 'online-game:' || game.id::text
      and ((select auth.jwt())->>'sub') in (game.white_clerk_id, game.black_clerk_id)
  );
$$;
revoke all on function caissa_online_private.can_read_current_game_topic()
  from public, anon, authenticated;
grant usage on schema caissa_online_private to authenticated;
grant execute on function caissa_online_private.can_read_current_game_topic()
  to authenticated;

revoke select on table public.caissa_online_games from authenticated;
drop policy if exists caissa_online_participant_game_read on public.caissa_online_games;

drop policy if exists caissa_online_game_broadcast_read on realtime.messages;
create policy caissa_online_game_broadcast_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and caissa_online_private.can_read_current_game_topic()
);

-- The client uses Broadcast only as a versioned invalidation signal and then
-- resyncs through the authoritative API. Do not publish NEW/OLD game rows.
create or replace function caissa_online_private.broadcast_game_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_version integer;
begin
  if tg_op = 'DELETE' then
    v_game_id := old.id;
    v_version := old.version;
  else
    v_game_id := new.id;
    v_version := new.version;
  end if;

  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'gameId', v_game_id::text,
      'version', v_version,
      'eventType', 'game.snapshot'
    ),
    tg_op,
    'online-game:' || v_game_id::text,
    true
  );
  return null;
end;
$$;
revoke all on function caissa_online_private.broadcast_game_change()
  from public, anon, authenticated;

revoke all on function caissa_identity_private.contains_default_ignorable(text) from public, anon, authenticated;
revoke all on function caissa_identity_private.nickname_display(text) from public, anon, authenticated;
revoke all on function caissa_identity_private.assert_policy_payload(text, text, integer) from public, anon, authenticated;
revoke all on function caissa_identity_private.generate_fallback_alias() from public, anon, authenticated;
revoke all on function caissa_identity_private.prepare_identity_row() from public, anon, authenticated;
revoke all on function caissa_identity_private.snapshot_online_game_names() from public, anon, authenticated;

revoke all on function public.caissa_public_identity_get_or_create(text) from public, anon, authenticated;
revoke all on function public.caissa_public_identity_check_nickname(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.caissa_public_identity_update(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.caissa_public_identity_resolve_many(text[]) from public, anon, authenticated;
grant execute on function public.caissa_public_identity_get_or_create(text) to service_role;
grant execute on function public.caissa_public_identity_check_nickname(text, text, text, integer) to service_role;
grant execute on function public.caissa_public_identity_update(text, text, text, integer, integer) to service_role;
grant execute on function public.caissa_public_identity_resolve_many(text[]) to service_role;

comment on table public.caissa_public_identities is
  'Public chess presentation identity only. Never stores email, private names, or authorization claims.';
comment on column public.caissa_online_games.identity_policy_version is
  '0 for historical names of unverified provenance; 1 for snapshots enforced by Public Identity v1.';
comment on function caissa_online_private.can_read_current_game_topic() is
  'Participant-only Realtime authorization without exposing full game rows to browser roles.';
