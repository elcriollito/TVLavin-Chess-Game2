#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:?repository path required}"
pg_root="/home/alexander/.local/share/caissa-online/supabase-home-split-recovery-20261011/cache/stack/slim-services/postgres/17.11.0.002-r0/linux-amd64"
lab_root="/home/alexander/.local/state/caissa-public-identity-lab"
data_dir="$lab_root/pgdata"
socket_dir="$lab_root/socket"
evidence_dir="$lab_root/evidence"
port="55439"
psql="$pg_root/bin/psql"
pg_ctl="$pg_root/bin/pg_ctl"
initdb="$pg_root/bin/initdb"

case "$lab_root" in /home/alexander/.local/state/caissa-public-identity-lab) ;; *) exit 70;; esac
mkdir -p "$lab_root" "$socket_dir" "$evidence_dir"
chmod 700 "$lab_root" "$socket_dir" "$evidence_dir"

cleanup() {
  if [ -s "$data_dir/postmaster.pid" ]; then "$pg_ctl" -D "$data_dir" -m fast stop >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

if [ -d "$data_dir" ]; then rm -rf -- "$data_dir"; fi
"$initdb" -D "$data_dir" --auth-local=trust --auth-host=reject --encoding=UTF8 \
  --locale-provider=icu --icu-locale=und --no-instructions >/dev/null
cat >> "$data_dir/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $port
unix_socket_directories = '$socket_dir'
logging_collector = off
log_connections = on
EOF
"$pg_ctl" -D "$data_dir" -l "$evidence_dir/postgres.log" start >/dev/null

db=("$psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -d postgres)

"${db[@]}" <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create schema realtime;
create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'member',
  is_premium boolean not null default false,
  credits integer not null default 5,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.users to service_role;
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create table realtime.messages(
  extension text,
  payload jsonb,
  event text,
  topic text,
  private boolean
);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable set search_path='' as $$
  select coalesce(current_setting('realtime.topic', true), '')
$$;
create function realtime.send(jsonb,text,text,boolean)
returns void language sql set search_path='' as $$
  insert into realtime.messages(extension,payload,event,topic,private)
  values ('broadcast',$1,$2,$3,$4)
$$;
create function realtime.broadcast_changes(text,text,text,text,text,anyelement,anyelement)
returns void language sql set search_path='' as $$ select $$;
SQL

"${db[@]}" --single-transaction -f "$repo_root/supabase/migrations/20261005204209_caissa_online_native_v1.sql" >/dev/null
"${db[@]}" --single-transaction -f "$repo_root/supabase/migrations/20261011150814_caissa_online_hardening_only_v3.sql" >/dev/null
"${db[@]}" -At <<'SQL' > "$evidence_dir/online-baseline.txt"
select 'online_function_digest='||md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','caissa_online_private') and p.proname like 'caissa_online_%';
SQL
"${db[@]}" --single-transaction -f "$repo_root/supabase/migrations/20261014035549_caissa_public_identity_v1.sql" >/dev/null

"${db[@]}" <<'SQL'
insert into public.users(clerk_id,email) values
 ('synthetic_identity_a','private-a@example.test'),
 ('synthetic_identity_b','private-b@example.test'),
 ('synthetic_identity_c','private-c@example.test'),
 ('synthetic_identity_without_public_row','private-d@example.test');
insert into public.users(clerk_id,email,role) values
 ('00000000-0000-4000-a000-000000abcdef',null,'online_guest');

do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.caissa_public_identities'::regclass) then
    raise exception 'RLS_NOT_ENABLED';
  end if;
  if has_table_privilege('anon','public.caissa_public_identities','SELECT')
    or has_table_privilege('authenticated','public.caissa_public_identities','SELECT')
    or has_table_privilege('authenticated','public.caissa_public_identities','UPDATE')
    or has_table_privilege('service_role','public.caissa_public_identities','UPDATE')
    or has_table_privilege('service_role','public.caissa_public_identities','INSERT') then
    raise exception 'BROWSER_TABLE_PRIVILEGE_PRESENT';
  end if;
  if has_function_privilege('anon','public.caissa_public_identity_update(text,text,text,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.caissa_public_identity_get_or_create(text)','EXECUTE') then
    raise exception 'BROWSER_RPC_PRIVILEGE_PRESENT';
  end if;
  if not has_function_privilege('service_role','public.caissa_public_identity_update(text,text,text,integer,integer)','EXECUTE') then
    raise exception 'SERVICE_RPC_PRIVILEGE_MISSING';
  end if;
end $$;

set role service_role;
select public.caissa_public_identity_get_or_create('synthetic_identity_a');
select public.caissa_public_identity_get_or_create('synthetic_identity_b');
select public.caissa_public_identity_get_or_create('synthetic_identity_c');
select public.caissa_public_identity_update('synthetic_identity_a','Café Knight','café knight',1,1);
do $$
begin
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Cafe\0301 Knight', 'café knight', 1, 1
    );
    raise exception 'NON_CANONICAL_DISPLAY_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', 'Safe Knight', 'safe knight', 2, 1
    );
    raise exception 'UNKNOWN_POLICY_VERSION_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', 'Safe Knight', 'forged-key', 1, 1
    );
    raise exception 'FORGED_NICKNAME_KEY_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Admin\034F', U&'admin\034F', 1, 1
    );
    raise exception 'DEFAULT_IGNORABLE_034F_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Admin\FE0F', U&'admin\FE0F', 1, 1
    );
    raise exception 'DEFAULT_IGNORABLE_FE0F_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Knight\3164Player', U&'knight\3164player', 1, 1
    );
    raise exception 'DEFAULT_IGNORABLE_3164_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Knight\+0E0100', U&'knight\+0E0100', 1, 1
    );
    raise exception 'DEFAULT_IGNORABLE_E0100_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.caissa_public_identity_update(
      'synthetic_identity_b', U&'Safe\FEFFKnight', 'safe knight', 1, 1
    );
    raise exception 'DEFAULT_IGNORABLE_FEFF_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.caissa_public_identities(user_id, fallback_alias)
    select id, 'Player-0011223344556677' from public.users where clerk_id='synthetic_identity_without_public_row';
    raise exception 'DIRECT_SERVICE_WRITE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  if public.caissa_public_identity_resolve_many(array['synthetic_identity_a'])::text like '%private-a@example.test%' then
    raise exception 'PRIVATE_DATA_IN_RESOLVER';
  end if;
end $$;
reset role;

insert into public.caissa_online_games(
  pool, rated, base_ms, increment_ms,
  white_user_id, black_user_id, white_clerk_id, black_clerk_id,
  white_display_name, black_display_name, white_time_ms, black_time_ms
)
select 'blitz', false, 180000, 2000,
  a.id, b.id, a.clerk_id, b.clerk_id,
  'private-a@example.test', 'Spoofed Browser Name', 180000, 180000
from public.users a cross join public.users b
where a.clerk_id='synthetic_identity_a' and b.clerk_id='synthetic_identity_b';

insert into public.caissa_online_games(
  pool, rated, base_ms, increment_ms,
  white_user_id, black_user_id, white_clerk_id, black_clerk_id,
  white_display_name, black_display_name, white_time_ms, black_time_ms
)
select 'blitz', false, 180000, 2000,
  a.id, g.id, a.clerk_id, g.clerk_id,
  'Spoofed Browser Name', 'Guest-ABCDEF', 180000, 180000
from public.users a cross join public.users g
where a.clerk_id='synthetic_identity_a' and g.clerk_id='00000000-0000-4000-a000-000000abcdef';

do $$
declare v_count integer; v_aliases integer;
begin
  select count(*), count(distinct fallback_alias) into v_count,v_aliases
  from public.caissa_public_identities;
  if v_count <> 3 or v_aliases <> 3 then raise exception 'ALIAS_INTEGRITY_FAILED'; end if;
  if exists(select 1 from public.caissa_public_identities where fallback_alias like '%synthetic%' or fallback_alias like '%@%') then
    raise exception 'ALIAS_PRIVACY_FAILED';
  end if;
  if not exists(
    select 1 from public.caissa_online_games
    where white_display_name='Café Knight'
      and black_display_name ~ '^Player-[0-9A-F]{16}$'
      and identity_policy_version=1
  ) then raise exception 'ONLINE_SNAPSHOT_NOT_CANONICAL'; end if;
  if not exists(
    select 1 from public.caissa_online_games
    where white_display_name='Café Knight' and black_display_name='Guest-ABCDEF'
  ) then raise exception 'GUEST_ALIAS_NOT_PRESERVED'; end if;

  begin
    insert into public.caissa_online_games(
      pool, rated, base_ms, increment_ms,
      white_user_id, black_user_id, white_clerk_id, black_clerk_id,
      white_display_name, black_display_name, white_time_ms, black_time_ms
    )
    select 'blitz', false, 180000, 2000,
      a.id, d.id, a.clerk_id, d.clerk_id,
      'Spoofed Browser Name', 'Private Missing Name', 180000, 180000
    from public.users a cross join public.users d
    where a.clerk_id='synthetic_identity_a'
      and d.clerk_id='synthetic_identity_without_public_row';
    raise exception 'MISSING_IDENTITY_DID_NOT_FAIL_CLOSED';
  exception when no_data_found then
    null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"synthetic_identity_a"}', false);
select set_config(
  'realtime.topic',
  'online-game:' || (
    select id::text from public.caissa_online_games
    where white_clerk_id = 'synthetic_identity_a'
    order by created_at asc limit 1
  ),
  false
);
set role authenticated;
do $$
begin
  begin
    perform 1 from public.caissa_online_games limit 1;
    raise exception 'DIRECT_AUTHENTICATED_GAME_READ_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  if not caissa_online_private.can_read_current_game_topic() then
    raise exception 'PARTICIPANT_TOPIC_REJECTED';
  end if;
end $$;
reset role;
select set_config('realtime.topic', 'online-game:00000000-0000-4000-a000-000000000000', false);
set role authenticated;
do $$
begin
  if caissa_online_private.can_read_current_game_topic() then
    raise exception 'NONPARTICIPANT_TOPIC_ACCEPTED';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from realtime.messages
    where payload ?& array['gameId','version','eventType']
  ) then
    raise exception 'COMPACT_REALTIME_PAYLOAD_MISSING';
  end if;
  if exists (
    select 1 from realtime.messages
    where payload ?| array[
      'white_display_name','black_display_name','pgn','white_clerk_id',
      'black_clerk_id','white_user_id','black_user_id','record','old_record'
    ]
  ) then
    raise exception 'PRIVATE_GAME_ROW_BROADCAST';
  end if;
end $$;
SQL

# Two independent transactions race for canonically equivalent spellings.
set +e
"${db[@]}" -c "set role service_role; select public.caissa_public_identity_update('synthetic_identity_b','CAFÉ Master','café master',1,1);" >"$evidence_dir/race-b.out" 2>&1 & p1=$!
"${db[@]}" -c "set role service_role; select public.caissa_public_identity_update('synthetic_identity_c','café master','café master',1,1);" >"$evidence_dir/race-c.out" 2>&1 & p2=$!
wait "$p1"; r1=$?
wait "$p2"; r2=$?
set -e
if ! { [ "$r1" -eq 0 ] && [ "$r2" -ne 0 ]; } && ! { [ "$r2" -eq 0 ] && [ "$r1" -ne 0 ]; }; then
  echo "concurrency result invalid: $r1/$r2" >&2; exit 1
fi

# Optimistic versioning permits only one simultaneous update of one identity.
set +e
"${db[@]}" -c "set role service_role; select public.caissa_public_identity_update('synthetic_identity_a','Royal Knight','royal knight',1,2);" >"$evidence_dir/same-owner-a.out" 2>&1 & p3=$!
"${db[@]}" -c "set role service_role; select public.caissa_public_identity_update('synthetic_identity_a','Open Knight','open knight',1,2);" >"$evidence_dir/same-owner-b.out" 2>&1 & p4=$!
wait "$p3"; r3=$?
wait "$p4"; r4=$?
set -e
if ! { [ "$r3" -eq 0 ] && [ "$r4" -ne 0 ]; } && ! { [ "$r4" -eq 0 ] && [ "$r3" -ne 0 ]; }; then
  echo "same-owner concurrency result invalid: $r3/$r4" >&2; exit 1
fi

"${db[@]}" -At <<'SQL' > "$evidence_dir/before-rollback.txt"
select 'identity_rows='||count(*) from public.caissa_public_identities;
select 'online_tables='||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'caissa_online_%' and c.relkind in ('r','p');
select 'online_function_digest='||md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','caissa_online_private') and p.proname like 'caissa_online_%';
select 'identity_catalog_digest='||md5(string_agg(v,'' order by v)) from (
 select n.nspname||'.'||c.relname||':'||c.relkind::text as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','caissa_identity_private') and c.relname like 'caissa_public_identities%'
 union all select n.nspname||'.'||p.proname||':'||pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','caissa_identity_private') and (p.proname like 'caissa_public_identity%' or n.nspname='caissa_identity_private')
) q;
select 'identity_snapshot_triggers='||count(*) from pg_trigger
  where tgname='caissa_online_games_public_identity_snapshot' and not tgisinternal;
select 'identity_game_columns='||count(*) from information_schema.columns
  where table_schema='public' and table_name='caissa_online_games' and column_name='identity_policy_version';
SQL

"${db[@]}" --single-transaction -f "$repo_root/supabase/rollback/20261014035549_caissa_public_identity_v1.rollback.sql" >/dev/null
"${db[@]}" -At <<'SQL' > "$evidence_dir/after-rollback.txt"
select 'identity_objects='||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','caissa_identity_private') and c.relname like 'caissa_public_identities%';
select 'identity_snapshot_triggers='||count(*) from pg_trigger
  where tgname='caissa_online_games_public_identity_snapshot' and not tgisinternal;
select 'identity_game_columns='||count(*) from information_schema.columns
  where table_schema='public' and table_name='caissa_online_games' and column_name='identity_policy_version';
select 'online_tables='||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'caissa_online_%' and c.relkind in ('r','p');
select 'online_function_digest='||md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','caissa_online_private') and p.proname like 'caissa_online_%';
SQL
if ! grep -q '^identity_objects=0$' "$evidence_dir/after-rollback.txt"; then exit 1; fi
if ! grep -q '^identity_snapshot_triggers=0$' "$evidence_dir/after-rollback.txt"; then exit 1; fi
if ! grep -q '^identity_game_columns=0$' "$evidence_dir/after-rollback.txt"; then exit 1; fi
before_online="$(grep '^online_function_digest=' "$evidence_dir/online-baseline.txt")"
after_online="$(grep '^online_function_digest=' "$evidence_dir/after-rollback.txt")"
if [ "$before_online" != "$after_online" ]; then echo 'Online catalog changed during rollback' >&2; exit 1; fi

"${db[@]}" --single-transaction -f "$repo_root/supabase/migrations/20261014035549_caissa_public_identity_v1.sql" >/dev/null
"${db[@]}" -At <<'SQL' > "$evidence_dir/after-reapply.txt"
select 'identity_catalog_digest='||md5(string_agg(v,'' order by v)) from (
 select n.nspname||'.'||c.relname||':'||c.relkind::text as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','caissa_identity_private') and c.relname like 'caissa_public_identities%'
 union all select n.nspname||'.'||p.proname||':'||pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','caissa_identity_private') and (p.proname like 'caissa_public_identity%' or n.nspname='caissa_identity_private')
) q;
select 'identity_game_columns='||count(*) from information_schema.columns
  where table_schema='public' and table_name='caissa_online_games' and column_name='identity_policy_version';
select 'backfilled_member_identities='||count(*) from public.caissa_public_identities;
SQL
before_identity="$(grep '^identity_catalog_digest=' "$evidence_dir/before-rollback.txt")"
after_identity="$(grep '^identity_catalog_digest=' "$evidence_dir/after-reapply.txt")"
if [ "$before_identity" != "$after_identity" ]; then echo 'Identity catalog is not reproducible' >&2; exit 1; fi
if ! grep -q '^identity_game_columns=1$' "$evidence_dir/after-reapply.txt"; then exit 1; fi
if ! grep -q '^backfilled_member_identities=4$' "$evidence_dir/after-reapply.txt"; then exit 1; fi

"${db[@]}" -At <<'SQL' > "$evidence_dir/catalog.txt"
select 'postgres_version='||current_setting('server_version');
select 'rls='||relrowsecurity from pg_class where oid='public.caissa_public_identities'::regclass;
select 'policies='||count(*) from pg_policies where schemaname='public' and tablename='caissa_public_identities';
select 'anon_select='||has_table_privilege('anon','public.caissa_public_identities','SELECT');
select 'authenticated_update='||has_table_privilege('authenticated','public.caissa_public_identities','UPDATE');
select 'service_table_update='||has_table_privilege('service_role','public.caissa_public_identities','UPDATE');
select 'service_update_rpc='||has_function_privilege('service_role','public.caissa_public_identity_update(text,text,text,integer,integer)','EXECUTE');
select 'online_tables='||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'caissa_online_%' and c.relkind in ('r','p');
SQL

cat "$evidence_dir/catalog.txt"
echo "race_exit_codes=$r1,$r2"
echo "same_owner_race_exit_codes=$r3,$r4"
echo "rollback=PASS"
echo "reapply=PASS"
echo "binding=127.0.0.1:$port"
