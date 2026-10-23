\set ON_ERROR_STOP on

do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text,
  role text not null default 'user',
  is_premium boolean not null default false,
  credits integer not null default 0,
  stripe_customer_id text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

\ir ../supabase/migrations/20260811_clerk_identity_remapping_foundation.sql
\ir ../supabase/migrations/20260811_clerk_migration_cutover_tooling.sql
\ir ../supabase/migrations/20261015220000_sec005_cutover_compatibility_v1.sql
\ir ../supabase/migrations/20261018171912_caissa_identity_ownership_v1.sql

create table public.identity_incident_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('ACTIVE','RELEASED'))
);
create table public.product_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null,
  source_reference text,
  source_event_id text,
  granted_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  action text not null,
  delta integer not null,
  balance_after integer not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete restrict,
  event_id text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.puzzle_training_progress (
  user_id uuid primary key references public.users(id) on delete cascade,
  rating integer not null default 1800,
  solved integer not null default 0,
  failed integer not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.puzzle_training_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_public_identities (
  user_id uuid primary key references public.users(id) on delete cascade,
  public_nickname text,
  nickname_key text,
  fallback_alias text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  version integer not null default 1
);
create table public.caissa_online_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null unique,
  display_name text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_ratings (
  user_id uuid not null references public.users(id) on delete cascade,
  pool text not null,
  rating integer not null default 1500,
  primary key (user_id,pool)
);
create table public.caissa_online_games (
  id uuid primary key default gen_random_uuid(),
  white_user_id uuid not null references public.users(id) on delete restrict,
  black_user_id uuid not null references public.users(id) on delete restrict,
  white_clerk_id text not null default 'white_subject',
  black_clerk_id text not null default 'black_subject',
  white_display_name text not null default 'White',
  black_display_name text not null default 'Black',
  identity_policy_version smallint not null default 1,
  draw_offer_by text,
  version bigint not null default 1,
  status text not null default 'active',
  pgn text not null default '[White "White"]' || E'\n' || '[Black "Black"]',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_rate_limits (
  clerk_id text not null,
  bucket text not null,
  window_started_at timestamptz not null default pg_catalog.clock_timestamp(),
  request_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(clerk_id,bucket)
);
create table public.caissa_online_matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  clerk_id text not null default 'ticket_subject',
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  clerk_id text not null default 'presence_subject'
);
create table public.caissa_online_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_user_id uuid not null references public.users(id) on delete cascade,
  challenged_user_id uuid not null references public.users(id) on delete cascade,
  state text not null default 'pending',
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.caissa_online_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null
);
create table public.caissa_online_tournament_participants (
  tournament_id uuid not null references public.caissa_online_tournaments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (tournament_id,user_id)
);
create table public.insight_datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  schema_version text not null default '1.0.0',
  game_count integer not null default 1,
  raw_pgn text not null default '1. e4',
  subject jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(user_id,id)
);
create table public.insight_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  dataset_id uuid not null,
  schema_version text not null default '1.0.0',
  analysis_status text not null default 'complete',
  verification_status text not null default 'structurally_validated',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (user_id,dataset_id) references public.insight_datasets(user_id,id)
);

-- Production-only data families are represented as contract fixtures so the
-- same migration is rehearsed against both the lean Staging graph and the
-- larger Production graph without touching either remote database.
create table public.library_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  fen text not null,
  synced_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.library_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_id text not null,
  name text not null,
  synced_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.library_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade
);
create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entitlement text not null,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  granted_by uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  note text
);
create table public.beta_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  experiment_id text,
  event_type text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  operation_id uuid not null,
  state text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.economic_usage_events (
  event_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.mentor_operation_results (
  operation_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  plaintext_bytes integer not null,
  expires_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_scans (
  scan_id uuid primary key,
  user_id uuid references public.users(id) on delete restrict,
  image_storage_reference text,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table public.scanner_beta_feedback (
  feedback_id uuid primary key,
  scan_id uuid not null references public.scanner_beta_scans(scan_id) on delete cascade,
  user_id uuid references public.users(id) on delete restrict
);
create table public.scanner_beta_scan_failures (
  feedback_id uuid primary key,
  user_id uuid references public.users(id) on delete restrict
);

-- Keep this block in the exact filename order used by Supabase.
\ir ../supabase/migrations/20261018174754_caissa_account_control_v1.sql
\ir ../supabase/migrations/20261018174844_caissa_account_control_v1_fk_indexes.sql
\ir ../supabase/migrations/20261018181749_caissa_account_control_v1_security_followup.sql

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ACCOUNT_CONTROL_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

insert into public.users(id,clerk_id,email,credits) values
 ('10000000-0000-4000-8000-000000000001','synthetic_dev_a','a@example.invalid',7),
 ('10000000-0000-4000-8000-000000000002','synthetic_dev_b','b@example.invalid',11),
 ('10000000-0000-4000-8000-000000000003','synthetic_dev_c','c@example.invalid',3),
 ('10000000-0000-4000-8000-000000000004','synthetic_dev_d','reusable@example.invalid',5);

-- The foundation backfill ran before these fixtures, so create exact synthetic bindings.
insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
select id,'legacy_development',clerk_id,'ACTIVE','LEGACY_BACKFILL',pg_catalog.clock_timestamp()
from public.users;

insert into public.puzzle_training_progress(user_id,rating,solved,failed)
values ('10000000-0000-4000-8000-000000000001',1850,18,9);
insert into public.puzzle_training_attempts(user_id,operation_id)
values ('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001');
insert into public.credit_events(user_id,action,delta,balance_after) values
 ('10000000-0000-4000-8000-000000000001','fixture',7,7),
 ('10000000-0000-4000-8000-000000000004','fixture',5,5);
insert into public.caissa_public_identities(user_id,public_nickname,nickname_key,fallback_alias) values
 ('10000000-0000-4000-8000-000000000001','Synthetic A','synthetic a','Player-AAAAAAAAAAAAAAAA'),
 ('10000000-0000-4000-8000-000000000004','Synthetic D','synthetic d','Player-DDDDDDDDDDDDDDDD');
insert into public.caissa_online_profiles(user_id,clerk_id,display_name) values
 ('10000000-0000-4000-8000-000000000001','synthetic_dev_a','Synthetic A'),
 ('10000000-0000-4000-8000-000000000004','synthetic_dev_d','Synthetic D');
insert into public.caissa_online_ratings(user_id,pool,rating) values
 ('10000000-0000-4000-8000-000000000001','rapid',1777),
 ('10000000-0000-4000-8000-000000000004','rapid',1666);
insert into public.caissa_online_games(white_user_id,black_user_id) values
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002');
insert into public.caissa_online_challenges(challenger_user_id,challenged_user_id) values
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002');
insert into public.caissa_online_tournaments(id,owner_user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.caissa_online_tournament_participants(tournament_id,user_id) values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.library_positions(user_id,local_id,fen) values
 ('10000000-0000-4000-8000-000000000004','fixture-position','8/8/8/8/8/8/8/8 w - - 0 1');
insert into public.library_collections(user_id,local_id,name) values
 ('10000000-0000-4000-8000-000000000004','fixture-collection','Fixture');
insert into public.library_sync_log(user_id) values
 ('10000000-0000-4000-8000-000000000004');
insert into public.user_entitlements(user_id,entitlement,revoked_at) values
 ('10000000-0000-4000-8000-000000000004','historic_fixture',pg_catalog.clock_timestamp());
insert into public.beta_audit_events(user_id,experiment_id,event_type) values
 ('10000000-0000-4000-8000-000000000004','fixture','experiment_opened');
insert into public.credit_reservations(id,user_id,operation_id,state) values
 ('71000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000001','RELEASED');
insert into public.economic_usage_events(event_id,user_id) values
 ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.mentor_operation_results(operation_id,user_id,content_type,plaintext_bytes,expires_at) values
 ('74000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',
  'MENTOR_RESULT_JSON_V1',128,pg_catalog.clock_timestamp()+interval '1 hour');
insert into public.scanner_beta_scans(scan_id,user_id) values
 ('75000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_feedback(feedback_id,scan_id,user_id) values
 ('76000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_scan_failures(feedback_id,user_id) values
 ('77000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
insert into public.scanner_beta_scans(scan_id,user_id,image_storage_reference) values
 ('75000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','private/synthetic-board.png');

do $$
declare v_binding uuid; v_summary jsonb;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_b';
  v_summary := public.caissa_account_control_summary(
    '10000000-0000-4000-8000-000000000002',v_binding);
  perform pg_temp.assert_true((v_summary->>'manualReviewRequired')::boolean,
    'scanner storage reference did not require manual review');
  perform pg_temp.assert_true(not (v_summary->'capabilities'->>'accountDeletion')::boolean,
    'scanner storage reference allowed automatic deletion');
end;
$$;

do $$
declare v_binding uuid; v_operation uuid; v_duplicate uuid; v_result jsonb;
begin
  select id into v_binding from public.identity_bindings
   where external_subject='synthetic_dev_a' and status='ACTIVE';
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
    repeat('a',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  select operation_id into v_duplicate from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
    repeat('a',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform pg_temp.assert_true(v_operation=v_duplicate,'idempotent prepare returned a different operation');
  begin
    perform public.prepare_caissa_account_control(
      '10000000-0000-4000-8000-000000000001',v_binding,'PROGRESS_RESET',
      repeat('9',64),repeat('b',64),repeat('c',64),pg_catalog.clock_timestamp()+interval '5 minutes');
    raise exception 'parallel operation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OPERATION_IN_PROGRESS%' then raise; end if;
  end;
  begin
    perform public.confirm_caissa_progress_reset(
      v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
      repeat('b',64),repeat('c',64),repeat('a',64),
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_b','UTF8')),'hex'));
    raise exception 'cross-subject confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OWNERSHIP_REQUIRED%' then raise; end if;
  end;
  v_result := public.confirm_caissa_progress_reset(
    v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
    repeat('b',64),repeat('c',64),repeat('a',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_a','UTF8')),'hex'));
  perform pg_temp.assert_true((v_result->>'puzzleAttemptsDeleted')::integer=1,'reset did not remove the attempt');
  v_result := public.confirm_caissa_progress_reset(
    v_operation,'10000000-0000-4000-8000-000000000001',v_binding,
    repeat('b',64),repeat('c',64),repeat('a',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_a','UTF8')),'hex'));
  perform pg_temp.assert_true((v_result->>'duplicate')::boolean,'replayed reset was not idempotent');
end;
$$;

select pg_temp.assert_true(
  not exists(select 1 from public.puzzle_training_progress where user_id='10000000-0000-4000-8000-000000000001')
  and not exists(select 1 from public.puzzle_training_attempts where user_id='10000000-0000-4000-8000-000000000001'),
  'selective reset left puzzle data'
);
select pg_temp.assert_true(
  (select credits=7 from public.users where id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.credit_events where user_id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.caissa_public_identities where user_id='10000000-0000-4000-8000-000000000001')
  and exists(select 1 from public.caissa_online_ratings where user_id='10000000-0000-4000-8000-000000000001'),
  'selective reset changed a preserved data class'
);

-- Cross-owner confirmation must not locate another account's operation.
do $$
declare v_operation uuid; v_binding_a uuid; v_binding_b uuid;
begin
  select id into v_binding_a from public.identity_bindings where external_subject='synthetic_dev_a';
  select id into v_binding_b from public.identity_bindings where external_subject='synthetic_dev_b';
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000001',v_binding_a,'PROGRESS_RESET',
    repeat('d',64),repeat('e',64),repeat('f',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  begin
    perform public.confirm_caissa_progress_reset(v_operation,
      '10000000-0000-4000-8000-000000000002',v_binding_b,
      repeat('e',64),repeat('f',64),repeat('d',64),
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_b','UTF8')),'hex'));
    raise exception 'cross-owner confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_OPERATION_NOT_FOUND%' then raise; end if;
  end;
end;
$$;

-- Provider failure is durable, fail-closed, and audit-idempotent.
do $$
declare v_binding uuid; v_operation uuid;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_c';
  insert into public.caissa_online_presence(user_id)
  values('10000000-0000-4000-8000-000000000003');
  insert into public.caissa_online_rate_limits(clerk_id,bucket)
  values('synthetic_dev_c','before-delete');
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000003',v_binding,'ACCOUNT_DELETION',
    repeat('1',64),repeat('2',64),repeat('3',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform public.lock_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000003',v_binding,
    repeat('2',64),repeat('3',64),repeat('1',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_c','UTF8')),'hex'));
  begin
    insert into public.caissa_online_presence(user_id)
    values('10000000-0000-4000-8000-000000000003')
    on conflict(user_id) do update set user_id=excluded.user_id;
    raise exception 'write barrier unexpectedly allowed presence recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.caissa_online_presence
    where user_id='10000000-0000-4000-8000-000000000003';
    raise exception 'write barrier unexpectedly allowed account-scoped delete';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.caissa_online_rate_limits(clerk_id,bucket)
    values('synthetic_dev_c','pending-delete');
    raise exception 'raw subject write unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.caissa_online_rate_limits set bucket='updated-after-lock'
    where clerk_id='synthetic_dev_c' and bucket='before-delete';
    raise exception 'raw subject update unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.users set email='blocked@example.invalid'
    where id='10000000-0000-4000-8000-000000000003';
    raise exception 'write barrier unexpectedly allowed user mutation';
  exception when sqlstate '55000' then null;
  end;
  insert into public.caissa_online_presence(user_id)
  values('10000000-0000-4000-8000-000000000002')
  on conflict(user_id) do update set user_id=excluded.user_id;
  begin
    update public.caissa_online_presence
    set user_id='10000000-0000-4000-8000-000000000003'
    where user_id='10000000-0000-4000-8000-000000000002';
    raise exception 'owner reassignment unexpectedly bypassed deletion lock';
  exception when sqlstate '55000' then null;
  end;
  perform public.erase_caissa_account_data(v_operation,
    '10000000-0000-4000-8000-000000000003',v_binding,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_c','UTF8')),'hex'));
  perform public.mark_caissa_auth_deletion_failed(v_operation,'10000000-0000-4000-8000-000000000003');
  perform public.mark_caissa_auth_deletion_failed(v_operation,'10000000-0000-4000-8000-000000000003');
  perform pg_temp.assert_true(
    (select status='FAILED_REVIEW' from public.caissa_account_control_operations where id=v_operation),
    'provider failure was not quarantined');
  perform pg_temp.assert_true(
    (select count(*)=1 from public.caissa_account_control_audit where operation_id=v_operation and event_type='AUTH_DELETION_FAILED'),
    'provider failure audit was duplicated');
end;
$$;

-- Successful erasure retains the UUID tombstone, economy, and shared game.
do $$
declare
  v_binding uuid;
  v_operation uuid;
  v_game_count integer;
  v_library integer;
  v_scanner integer;
  v_mentor integer;
  v_beta integer;
  v_economy integer;
  v_owner_leaks integer;
begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_d';
  select count(*) into v_game_count from public.caissa_online_games;
  select
    count(*) filter(where section='libraryPositions'),
    count(*) filter(where section='scannerScans'),
    count(*) filter(where section='mentorResults'),
    count(*) filter(where section='betaActivity'),
    count(*) filter(where section='creditReservations'),
    count(*) filter(where data ? 'user_id')
  into v_library,v_scanner,v_mentor,v_beta,v_economy,v_owner_leaks
  from (
    select 'libraryPositions' section,data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'libraryPositions',0,100,clock_timestamp())
    union all select 'scannerScans',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'scannerScans',0,100,clock_timestamp())
    union all select 'mentorResults',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'mentorResults',0,100,clock_timestamp())
    union all select 'betaActivity',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'betaActivity',0,100,clock_timestamp())
    union all select 'creditReservations',data from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000004',v_binding,'creditReservations',0,100,clock_timestamp())
  ) export_rows;
  perform pg_temp.assert_true(v_library=1,'library position missing from private export');
  perform pg_temp.assert_true(v_scanner=1,'scanner record missing from private export');
  perform pg_temp.assert_true(v_mentor=1,'mentor result metadata missing from private export');
  perform pg_temp.assert_true(v_beta=1,'beta activity missing from private export');
  perform pg_temp.assert_true(v_economy=1,'economic evidence missing from private export');
  perform pg_temp.assert_true(v_owner_leaks=0,'internal owner column leaked from private export');
  select operation_id into v_operation from public.prepare_caissa_account_control(
    '10000000-0000-4000-8000-000000000004',v_binding,'ACCOUNT_DELETION',
    repeat('4',64),repeat('5',64),repeat('6',64),pg_catalog.clock_timestamp()+interval '5 minutes');
  perform public.lock_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding,
    repeat('5',64),repeat('6',64),repeat('4',64),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_d','UTF8')),'hex'));
  perform public.erase_caissa_account_data(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('synthetic_dev_d','UTF8')),'hex'));
  perform public.complete_caissa_account_deletion(v_operation,
    '10000000-0000-4000-8000-000000000004',v_binding);
  perform pg_temp.assert_true((select state='DELETED' from public.caissa_account_states
    where user_id='10000000-0000-4000-8000-000000000004'),'deleted state missing');
  perform pg_temp.assert_true((select clerk_id like 'deleted_%' and email is null from public.users
    where id='10000000-0000-4000-8000-000000000004'),'user tombstone invalid');
  perform pg_temp.assert_true((select count(*)=v_game_count from public.caissa_online_games),'shared game was deleted');
  perform pg_temp.assert_true(exists(select 1 from public.credit_events
    where user_id='10000000-0000-4000-8000-000000000004'),'credit evidence was deleted');
  perform pg_temp.assert_true(exists(select 1 from public.caissa_online_tournament_participants
    where user_id='10000000-0000-4000-8000-000000000004'),'shared tournament history was deleted');
  perform pg_temp.assert_true((select state='cancelled' from public.caissa_online_challenges
    where challenger_user_id='10000000-0000-4000-8000-000000000004'),'pending challenge was not safely cancelled');
  perform pg_temp.assert_true(not exists(select 1 from public.caissa_public_identities
    where user_id='10000000-0000-4000-8000-000000000004'),'public identity was not erased');
  perform pg_temp.assert_true(not exists(select 1 from public.library_positions
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.library_collections
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.scanner_beta_scans
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.mentor_operation_results
    where user_id='10000000-0000-4000-8000-000000000004')
    and not exists(select 1 from public.beta_audit_events
    where user_id='10000000-0000-4000-8000-000000000004'),
    'owned library, scanner, mentor, or beta activity was not erased');
  perform pg_temp.assert_true(exists(select 1 from public.user_entitlements
    where user_id='10000000-0000-4000-8000-000000000004')
    and exists(select 1 from public.credit_reservations
    where user_id='10000000-0000-4000-8000-000000000004')
    and exists(select 1 from public.economic_usage_events
    where user_id='10000000-0000-4000-8000-000000000004'),
    'retained entitlement or economic evidence was deleted');
  perform pg_temp.assert_true(not exists(select 1 from public.identity_bindings
    where user_id='10000000-0000-4000-8000-000000000004' and external_subject='synthetic_dev_d'),
    'deleted Clerk subject was retained in plaintext');
  begin
    insert into public.caissa_public_identities(user_id,fallback_alias)
    values('10000000-0000-4000-8000-000000000004','should-not-return');
    raise exception 'write barrier unexpectedly allowed deleted identity recreation';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.caissa_online_rate_limits(clerk_id,bucket)
    values('synthetic_dev_d','post-delete');
    raise exception 'raw external subject unexpectedly returned after deletion';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- Re-registration with the same email creates a new UUID and inherits nothing.
insert into public.users(id,clerk_id,email) values
 ('10000000-0000-4000-8000-000000000005','synthetic_dev_new','reusable@example.invalid');
insert into public.identity_bindings(user_id,environment,external_subject,status,proof_method,activated_at)
values ('10000000-0000-4000-8000-000000000005','legacy_development','synthetic_dev_new','ACTIVE','NEW_ACCOUNT',pg_catalog.clock_timestamp());
select pg_temp.assert_true(
  not exists(select 1 from public.credit_events where user_id='10000000-0000-4000-8000-000000000005')
  and not exists(select 1 from public.caissa_online_ratings where user_id='10000000-0000-4000-8000-000000000005')
  and (select credits=0 from public.users where id='10000000-0000-4000-8000-000000000005'),
  'new registration inherited deleted-account data'
);

select pg_temp.assert_true(
  not pg_catalog.has_table_privilege('anon','public.caissa_account_control_operations','SELECT')
  and not pg_catalog.has_table_privilege('authenticated','public.caissa_account_control_operations','SELECT')
  and pg_catalog.has_function_privilege('service_role','public.caissa_account_control_summary(uuid,uuid)','EXECUTE')
  and pg_catalog.has_function_privilege('service_role','public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.export_caissa_account_data_page(uuid,uuid,text,integer,integer,timestamptz)','EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated','public.caissa_account_control_summary(uuid,uuid)','EXECUTE'),
  'account control privilege boundary is incorrect'
);

do $$ declare v_binding uuid; begin
  select id into v_binding from public.identity_bindings where external_subject='synthetic_dev_a';
  begin
    perform * from public.export_caissa_account_data_page(
      '10000000-0000-4000-8000-000000000001',v_binding,'puzzleAttempts',0,101,clock_timestamp());
    raise exception 'oversized export page unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%CAISSA_ACCOUNT_EXPORT_PAGE_INVALID%' then raise; end if;
  end;
end $$;

select pg_temp.assert_true(
  exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    where c.oid='public.caissa_online_rate_limits'::regclass and t.tgname='caissa_account_write_barrier' and not t.tgisinternal),
  'raw-subject rate-limit barrier is missing'
);

select pg_temp.assert_true(not exists(
  select 1
  from pg_catalog.pg_constraint fk
  join pg_catalog.pg_class rel on rel.oid=fk.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=rel.relnamespace
  where fk.contype='f' and fk.confrelid='public.users'::regclass and ns.nspname='public'
    and rel.relname not in (
      'caissa_account_states','caissa_account_control_operations',
      'caissa_account_control_audit','caissa_account_control_rate_limits'
    )
    and not exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=rel.oid and t.tgname='caissa_account_write_barrier' and not t.tgisinternal)
), 'a current users foreign-key table is missing the account write barrier');

\echo CAISSA_ACCOUNT_CONTROL_POSTGRES_PASS
